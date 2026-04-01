#!/usr/bin/env bash
# Deploy the contact-submit edge function to Supabase.
# ALWAYS uses --no-verify-jwt because the contact form is public (no auth token sent).
# Without this flag, Supabase re-enables JWT verification and ALL form submissions
# silently fail with 401.

set -euo pipefail

PROJECT_REF="sezzqhmsfulclcqmfwja"

echo "Deploying contact-submit to Supabase (project: $PROJECT_REF)..."
echo "Using --no-verify-jwt (required for public contact form)"
echo ""

npx supabase functions deploy contact-submit \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "Deploy complete. Testing endpoint responds..."

# Send OPTIONS preflight to verify function is alive without consuming rate limits
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  "https://$PROJECT_REF.supabase.co/functions/v1/contact-submit" \
  -H "Origin: https://sheepdogtexas.com")

if [ "$RESPONSE" = "200" ]; then
  echo "Endpoint alive (OPTIONS $RESPONSE) — deploy verified."
else
  echo "WARNING: Endpoint returned $RESPONSE — something may be wrong!"
  echo "Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/contact-submit/logs"
fi
