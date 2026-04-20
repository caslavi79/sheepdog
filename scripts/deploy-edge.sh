#!/usr/bin/env bash
# Deploy ALL edge functions to Supabase.
# ALWAYS uses --no-verify-jwt because:
#   - contact-submit: public contact form (no auth token sent)
#   - license-reminders: invoked by cron (no user JWT)
#   - stripe-webhook: authenticated by Stripe signature header (not JWT)
#   - stripe-payment-intent: public /pay/:token page (authed by token UUID)
# Without this flag, Supabase re-enables JWT verification and functions fail with 401.

set -euo pipefail

PROJECT_REF="sezzqhmsfulclcqmfwja"

echo "═══════════════════════════════════════════════"
echo "Deploying edge functions to Supabase"
echo "Project: $PROJECT_REF"
echo "═══════════════════════════════════════════════"

# Deploy contact-submit
echo ""
echo "1/10 Deploying contact-submit..."
npx supabase functions deploy contact-submit \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

# Deploy license-reminders
echo ""
echo "2/10 Deploying license-reminders..."
npx supabase functions deploy license-reminders \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "3/10 Deploying contract-sign..."
npx supabase functions deploy contract-sign \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "4/10 Deploying contract-send..."
npx supabase functions deploy contract-send \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "5/10 Deploying invoice-send..."
npx supabase functions deploy invoice-send \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "6/10 Deploying payment-reminders..."
npx supabase functions deploy payment-reminders \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "7/10 Deploying claude-assistant..."
npx supabase functions deploy claude-assistant \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "8/10 Deploying claude-cron..."
npx supabase functions deploy claude-cron \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "9/10 Deploying stripe-payment-intent..."
npx supabase functions deploy stripe-payment-intent \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "10/10 Deploying stripe-webhook..."
npx supabase functions deploy stripe-webhook \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "Deploy complete. Verifying endpoints..."
# Disable errexit for the verification section so a transient network error
# on one curl doesn't abort the remaining checks — we want to see which
# functions are actually alive, not stop at the first flaky one.
set +e

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

# Verify invoice-send (expects 405 on GET since it's POST-only)
RESPONSE5=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/invoice-send")

if [ "$RESPONSE5" = "405" ]; then
  echo "  invoice-send: alive (GET $RESPONSE5 — expected, POST only)"
else
  echo "  invoice-send: WARNING — returned $RESPONSE5"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/invoice-send/logs"
fi

# Verify payment-reminders
RESPONSE6=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/payment-reminders")

if [ "$RESPONSE6" = "200" ]; then
  echo "  payment-reminders: alive (GET $RESPONSE6)"
else
  echo "  payment-reminders: WARNING — returned $RESPONSE6"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/payment-reminders/logs"
fi

# Verify claude-assistant (expects 405 on GET since it's POST-only)
RESPONSE7=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/claude-assistant")

if [ "$RESPONSE7" = "405" ]; then
  echo "  claude-assistant: alive (GET $RESPONSE7 — expected, POST only)"
else
  echo "  claude-assistant: WARNING — returned $RESPONSE7"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/claude-assistant/logs"
fi

# Verify claude-cron
RESPONSE8=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/claude-cron")

if [ "$RESPONSE8" = "200" ]; then
  echo "  claude-cron: alive (GET $RESPONSE8)"
else
  echo "  claude-cron: WARNING — returned $RESPONSE8"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/claude-cron/logs"
fi

# Verify stripe-payment-intent
# Without STRIPE_SECRET_KEY set: returns 503 (stripe_not_configured).
# With keys set, but no token in URL: returns 400 (Missing payment token).
# Either response proves the function is alive; 200 requires a valid token.
RESPONSE9=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/stripe-payment-intent")

if [ "$RESPONSE9" = "400" ] || [ "$RESPONSE9" = "503" ]; then
  echo "  stripe-payment-intent: alive (GET $RESPONSE9 — expected, requires token or keys)"
else
  echo "  stripe-payment-intent: WARNING — returned $RESPONSE9"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/stripe-payment-intent/logs"
fi

# Verify stripe-webhook (expects 405 on GET since POST only)
RESPONSE10=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://$PROJECT_REF.supabase.co/functions/v1/stripe-webhook")

if [ "$RESPONSE10" = "405" ]; then
  echo "  stripe-webhook: alive (GET $RESPONSE10 — expected, POST only)"
else
  echo "  stripe-webhook: WARNING — returned $RESPONSE10"
  echo "  Check: https://supabase.com/dashboard/project/$PROJECT_REF/functions/stripe-webhook/logs"
fi

set -e  # restore errexit

echo ""
echo "Done."
