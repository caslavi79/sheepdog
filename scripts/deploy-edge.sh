#!/usr/bin/env bash
# Deploy ALL edge functions to Supabase.
# ALWAYS uses --no-verify-jwt because:
#   - contact-submit: public contact form (no auth token sent)
#   - license-reminders: invoked by cron (no user JWT)
# Without this flag, Supabase re-enables JWT verification and functions fail with 401.

set -euo pipefail

PROJECT_REF="sezzqhmsfulclcqmfwja"

echo "═══════════════════════════════════════════════"
echo "Deploying edge functions to Supabase"
echo "Project: $PROJECT_REF"
echo "═══════════════════════════════════════════════"

# Deploy contact-submit
echo ""
echo "1/4 Deploying contact-submit..."
npx supabase functions deploy contact-submit \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

# Deploy license-reminders
echo ""
echo "2/4 Deploying license-reminders..."
npx supabase functions deploy license-reminders \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "3/4 Deploying contract-sign..."
npx supabase functions deploy contract-sign \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "4/4 Deploying contract-send..."
npx supabase functions deploy contract-send \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "Deploy complete. Verifying endpoints..."

# Verify contact-submit
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  "https://$PROJECT_REF.supabase.co/functions/v1/contact-submit" \
  -H "Origin: https://sheepdogtexas.com")

if [ "$RESPONSE" = "200" ]; then
  echo "  contact-submit: alive (OPTIONS $RESPONSE)"
else
  echo "  contact-submit: WARNING — returned $RESPONSE"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/contact-submit/logs"
fi

# Verify license-reminders
RESPONSE2=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/license-reminders")

if [ "$RESPONSE2" = "200" ]; then
  echo "  license-reminders: alive (GET $RESPONSE2)"
else
  echo "  license-reminders: WARNING — returned $RESPONSE2"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/license-reminders/logs"
fi

# Verify contract-sign
RESPONSE3=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/contract-sign?token=00000000-0000-0000-0000-000000000000")

if [ "$RESPONSE3" = "404" ]; then
  echo "  contract-sign: alive (GET $RESPONSE3 — expected for invalid token)"
else
  echo "  contract-sign: WARNING — returned $RESPONSE3"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/contract-sign/logs"
fi

# Verify contract-send (expects 405 on GET since it's POST-only)
RESPONSE4=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/contract-send")

if [ "$RESPONSE4" = "405" ]; then
  echo "  contract-send: alive (GET $RESPONSE4 — expected, POST only)"
else
  echo "  contract-send: WARNING — returned $RESPONSE4"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/contract-send/logs"
fi

echo ""
echo "Done."
