import inspect
import json
import re
from pathlib import Path

from graphify.analyze import god_nodes, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.export import to_html
from graphify.report import generate
from networkx.readwrite import json_graph


ROOT = Path(__file__).resolve().parents[1]
GRAPHIFY_OUT = ROOT / 'graphify-out'
EXTRACT_PATH = GRAPHIFY_OUT / '.graphify_extract.json'
DETECT_PATH = GRAPHIFY_OUT / '.graphify_detect.json'
GRAPH_PATH = GRAPHIFY_OUT / 'graph.json'
ANALYSIS_PATH = GRAPHIFY_OUT / '.graphify_analysis.json'
REPORT_PATH = GRAPHIFY_OUT / 'GRAPH_REPORT.md'
HTML_PATH = GRAPHIFY_OUT / 'graph.html'
VIEW_DATA_PATH = GRAPHIFY_OUT / 'graph-view-data.js'
ENRICHMENT_AUDIT_PATH = GRAPHIFY_OUT / '.graphify_enrichment.json'

LOCAL_IMPORT_PATTERNS = (
    re.compile(r"import\s+[^;]*?from\s+['\"](?P<spec>[^'\"]+)['\"]"),
    re.compile(r"export\s+[^;]*?from\s+['\"](?P<spec>[^'\"]+)['\"]"),
    re.compile(r"require\(\s*['\"](?P<spec>[^'\"]+)['\"]\s*\)"),
)
REQUIRE_ALIAS_PATTERN = re.compile(
    r"const\s+(?P<alias>[A-Za-z_$][\w$]*)\s*=\s*require\(\s*['\"](?P<spec>[^'\"]+)['\"]\s*\)"
)
APP_USE_PATTERN = re.compile(
    r"app\.use\(\s*['\"](?P<prefix>/api/[^'\"]+)['\"]\s*,\s*(?P<alias>[A-Za-z_$][\w$]*)\s*\)"
)
API_CALL_PATTERN = re.compile(
    r"\bapi\.(?P<method>get|post|put|delete|patch)\(\s*(?P<quote>['\"`])(?P<path>.*?)(?P=quote)",
    re.DOTALL,
)


def normalize_rel(path_value):
    return Path(str(path_value).replace('\\', '/')).as_posix()


def source_line(text, index):
    return f"L{text.count(chr(10), 0, index) + 1}"


def resolve_local_specifier(source_rel, specifier):
    source_abs = ROOT / source_rel
    candidate = (source_abs.parent / specifier).resolve()
    candidates = []

    if candidate.suffix:
        candidates.append(candidate)
    else:
        for ext in ('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'):
            candidates.append(Path(f"{candidate}{ext}"))
        for index_name in ('index.js', 'index.jsx', 'index.ts', 'index.tsx'):
            candidates.append(candidate / index_name)

    for item in candidates:
        try:
            rel = item.relative_to(ROOT)
        except ValueError:
            continue
        if item.is_file():
            return rel.as_posix()

    return None


def load_extraction():
    return json.loads(EXTRACT_PATH.read_text(encoding='utf-8'))


def build_file_node_map(nodes):
    file_nodes = {}
    by_source = {}

    for node in nodes:
        source_file = node.get('source_file')
        if not source_file:
            continue
        rel = normalize_rel(source_file)
        by_source.setdefault(rel, []).append(node)

    for rel, source_nodes in by_source.items():
        filename = Path(rel).name
        exact_match = next(
            (
                node
                for node in source_nodes
                if node.get('file_type') == 'code' and node.get('label') == filename
            ),
            None,
        )
        if exact_match:
            file_nodes[rel] = exact_match
            continue

        line_one_match = next(
            (
                node
                for node in source_nodes
                if node.get('file_type') == 'code' and node.get('source_location') == 'L1'
            ),
            None,
        )
        if line_one_match:
            file_nodes[rel] = line_one_match

    return file_nodes


def existing_edge_keys(edges):
    keys = set()
    for edge in edges:
        source = edge.get('source') or edge.get('_src')
        target = edge.get('target') or edge.get('_tgt')
        relation = edge.get('relation')
        if source and target and relation:
            keys.add((source, target, relation))
    return keys


def add_edge(edge_list, key_set, source_id, target_id, relation, source_file, source_location):
    key = (source_id, target_id, relation)
    if key in key_set or source_id == target_id:
        return False
    edge_list.append(
        {
            'source': source_id,
            'target': target_id,
            'relation': relation,
            'confidence': 'INFERRED',
            'source_file': source_file,
            'source_location': source_location,
        }
    )
    key_set.add(key)
    return True


def collect_local_import_edges(file_nodes, edge_keys):
    new_edges = []
    added = 0

    for source_rel, source_node in file_nodes.items():
        source_abs = ROOT / source_rel
        if not source_abs.is_file():
            continue
        try:
            text = source_abs.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue

        for pattern in LOCAL_IMPORT_PATTERNS:
            for match in pattern.finditer(text):
                specifier = match.group('spec')
                if not specifier.startswith('.'):
                    continue
                target_rel = resolve_local_specifier(source_rel, specifier)
                if not target_rel or target_rel not in file_nodes:
                    continue
                added += int(
                    add_edge(
                        new_edges,
                        edge_keys,
                        source_node['id'],
                        file_nodes[target_rel]['id'],
                        'imports_local',
                        source_rel,
                        source_line(text, match.start()),
                    )
                )

    return new_edges, added


def parse_server_route_mounts(file_nodes):
    server_index_rel = 'server/index.js'
    server_index_node = file_nodes.get(server_index_rel)
    if not server_index_node:
        return {}, []

    text = (ROOT / server_index_rel).read_text(encoding='utf-8')
    alias_to_target = {}
    for match in REQUIRE_ALIAS_PATTERN.finditer(text):
        specifier = match.group('spec')
        if not specifier.startswith('.'):
            continue
        target_rel = resolve_local_specifier(server_index_rel, specifier)
        if target_rel:
            alias_to_target[match.group('alias')] = target_rel

    prefix_to_target = {}
    mount_records = []
    for match in APP_USE_PATTERN.finditer(text):
        alias = match.group('alias')
        target_rel = alias_to_target.get(alias)
        if not target_rel or target_rel not in file_nodes:
            continue
        prefix = match.group('prefix')
        prefix_to_target[prefix] = target_rel
        mount_records.append(
            {
                'source_id': server_index_node['id'],
                'target_id': file_nodes[target_rel]['id'],
                'source_file': server_index_rel,
                'source_location': source_line(text, match.start()),
            }
        )

    return prefix_to_target, mount_records


def collect_route_mount_edges(edge_keys, mount_records):
    new_edges = []
    added = 0
    for record in mount_records:
        added += int(
            add_edge(
                new_edges,
                edge_keys,
                record['source_id'],
                record['target_id'],
                'mounts_route',
                record['source_file'],
                record['source_location'],
            )
        )
    return new_edges, added


def route_prefix_root(prefix):
    parts = [part for part in prefix.split('/') if part]
    if len(parts) < 2:
        return None
    return parts[1]


def call_root(path_value):
    trimmed = path_value.strip()
    if '${' in trimmed:
        trimmed = trimmed.split('${', 1)[0]
    if '?' in trimmed:
        trimmed = trimmed.split('?', 1)[0]
    if not trimmed.startswith('/'):
        return None
    parts = [part for part in trimmed.split('/') if part]
    return parts[0] if parts else None


def collect_api_route_edges(file_nodes, edge_keys, prefix_to_target):
    root_to_target = {}
    for prefix, target_rel in prefix_to_target.items():
        root = route_prefix_root(prefix)
        if root:
            root_to_target[root] = target_rel

    new_edges = []
    added = 0
    api_file_rel = 'client/src/lib/api.js'
    api_node = file_nodes.get(api_file_rel)
    server_index_node = file_nodes.get('server/index.js')

    if api_node and server_index_node:
        added += int(
            add_edge(
                new_edges,
                edge_keys,
                api_node['id'],
                server_index_node['id'],
                'targets_api_base',
                api_file_rel,
                'L1',
            )
        )

    for source_rel, source_node in file_nodes.items():
        if not source_rel.startswith('client/'):
            continue
        source_abs = ROOT / source_rel
        if not source_abs.is_file():
            continue
        try:
            text = source_abs.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue

        for match in API_CALL_PATTERN.finditer(text):
            root = call_root(match.group('path'))
            target_rel = root_to_target.get(root)
            if not target_rel or target_rel not in file_nodes:
                continue
            added += int(
                add_edge(
                    new_edges,
                    edge_keys,
                    source_node['id'],
                    file_nodes[target_rel]['id'],
                    'calls_api',
                    source_rel,
                    source_line(text, match.start()),
                )
            )

    return new_edges, added


def rebuild_outputs(extraction):
    graph = build_from_json(extraction)
    communities = cluster(graph)
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    detection_result = (
        json.loads(DETECT_PATH.read_text(encoding='utf-8'))
        if DETECT_PATH.exists()
        else {'total_files': 0, 'total_words': 0}
    )

    GRAPH_PATH.write_text(
        json.dumps(json_graph.node_link_data(graph, edges='links'), indent=2),
        encoding='utf-8',
    )
    ANALYSIS_PATH.write_text(
        json.dumps(
            {
                'communities': {str(key): value for key, value in communities.items()},
                'cohesion': {},
                'god_nodes': gods,
                'surprises': surprises,
            },
            indent=2,
        ),
        encoding='utf-8',
    )

    report_signature = inspect.signature(generate)
    report_kwargs = {}
    if 'suggested_questions' in report_signature.parameters:
        report_kwargs['suggested_questions'] = None

    report = generate(
        graph,
        communities,
        {},
        {},
        gods,
        surprises,
        detection_result,
        {'input': 0, 'output': 0},
        str(ROOT),
        **report_kwargs,
    )
    REPORT_PATH.write_text(report, encoding='utf-8')

    try:
        to_html(graph, communities, str(HTML_PATH), community_labels=None)
    except TypeError:
        to_html(graph, communities, str(HTML_PATH))

    VIEW_DATA_PATH.write_text(
        'window.GRAPH_VIEW = ' + json.dumps({'graph': json.loads(GRAPH_PATH.read_text(encoding='utf-8')), 'analysis': json.loads(ANALYSIS_PATH.read_text(encoding='utf-8'))}, ensure_ascii=False) + ';',
        encoding='utf-8',
    )

    return graph, communities


def main():
    extraction = load_extraction()
    nodes = extraction.get('nodes', [])
    edges = extraction.get('edges', [])
    file_nodes = build_file_node_map(nodes)
    edge_keys = existing_edge_keys(edges)

    local_edges, local_count = collect_local_import_edges(file_nodes, edge_keys)
    prefix_to_target, mount_records = parse_server_route_mounts(file_nodes)
    mount_edges, mount_count = collect_route_mount_edges(edge_keys, mount_records)
    api_edges, api_count = collect_api_route_edges(file_nodes, edge_keys, prefix_to_target)

    all_new_edges = local_edges + mount_edges + api_edges
    extraction['edges'] = edges + all_new_edges
    EXTRACT_PATH.write_text(json.dumps(extraction, indent=2), encoding='utf-8')

    graph, communities = rebuild_outputs(extraction)

    audit = {
        'local_import_edges_added': local_count,
        'route_mount_edges_added': mount_count,
        'api_route_edges_added': api_count,
        'total_new_edges_added': len(all_new_edges),
        'graph_nodes': graph.number_of_nodes(),
        'graph_edges': graph.number_of_edges(),
        'communities': len(communities),
    }
    ENRICHMENT_AUDIT_PATH.write_text(json.dumps(audit, indent=2), encoding='utf-8')

    print(json.dumps(audit, indent=2))


if __name__ == '__main__':
    main()