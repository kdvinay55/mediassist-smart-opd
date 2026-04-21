Set-Location $PSScriptRoot
node ./node_modules/@playwright/test/cli.js test --reporter=list *> full-run-3.log
"EXIT=$LASTEXITCODE"
