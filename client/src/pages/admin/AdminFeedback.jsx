import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Star, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react';
import { formatDate } from '../../lib/utils';

export default function AdminFeedback() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get('/admin/feedback');
        setFeedback(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>;

  const avgRating = feedback.length > 0 ? (feedback.reduce((s, f) => s + f.overallRating, 0) / feedback.length).toFixed(1) : 'N/A';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patient Feedback</h1>
        <p className="text-gray-500">Review and analyze patient feedback</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card text-center">
          <Star className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-900">{avgRating}</p>
          <p className="text-sm text-gray-500">Average Rating</p>
        </div>
        <div className="card text-center">
          <MessageSquare className="w-8 h-8 text-primary-500 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-900">{feedback.length}</p>
          <p className="text-sm text-gray-500">Total Responses</p>
        </div>
        <div className="card text-center">
          <ThumbsUp className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-3xl font-bold text-gray-900">
            {feedback.filter(f => f.wouldRecommend).length}
          </p>
          <p className="text-sm text-gray-500">Would Recommend</p>
        </div>
      </div>

      {feedback.length === 0 ? (
        <div className="card text-center py-12">
          <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No feedback yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.map(f => (
            <div key={f._id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-sm font-bold">
                    {f.patientId?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{f.patientId?.name || 'Anonymous'}</p>
                    <p className="text-xs text-gray-500">{formatDate(f.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`w-4 h-4 ${s <= f.overallRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                  ))}
                </div>
              </div>
              {f.comment && <p className="text-sm text-gray-700 mt-2">{f.comment}</p>}
              <div className="flex items-center gap-3 mt-3">
                {f.wouldRecommend !== null && (
                  <span className={`badge ${f.wouldRecommend ? 'badge-green' : 'badge-red'}`}>
                    {f.wouldRecommend ? '👍 Recommends' : '👎 Does not recommend'}
                  </span>
                )}
                {f.categories?.map(c => (
                  <span key={c} className="badge badge-blue capitalize">{c.replace('-', ' ')}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
