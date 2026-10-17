#!/usr/bin/env bash
set -euo pipefail
set +x

: "${SIGNING_API_URL:?SIGNING_API_URL is required}"
SIGNING_PURPOSE="${SIGNING_PURPOSE:-generated}"
case "$SIGNING_PURPOSE" in generated|builder) ;; *) echo "::error::Invalid SIGNING_PURPOSE."; exit 1 ;; esac
OIDC_TOKEN="$(curl --fail --silent --show-error --max-time 20 -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=as-app-builder-signing-key" | jq -r '.value')"
test -n "$OIDC_TOKEN" && test "$OIDC_TOKEN" != "null"
echo "::add-mask::$OIDC_TOKEN"

KEY_URL="${SIGNING_API_URL%/}/api/internal/key?purpose=$SIGNING_PURPOSE"
RESPONSE_FILE="$RUNNER_TEMP/as-builder-signing-response.json"
HTTP_STATUS="$(curl --silent --show-error --max-time 30 -H "Authorization: Bearer $OIDC_TOKEN" -H "Accept: application/json" -o "$RESPONSE_FILE" -w '%{http_code}' "$KEY_URL")"

if [ "$HTTP_STATUS" = "404" ]; then
  echo "No permanent APK signing key exists yet; generating it once."
  KEY_PATH="$RUNNER_TEMP/as-builder-signing.p12"
  STORE_PASS="$(openssl rand -base64 36 | tr -d '\n')"
  KEY_ALIAS="as-builder-release"
  KEY_PASS="$STORE_PASS"
  keytool -genkeypair \
    -keystore "$KEY_PATH" -storetype PKCS12 \
    -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
    -alias "$KEY_ALIAS" -keyalg RSA -keysize 3072 -validity 10000 \
    -dname "CN=A.S. APP BUILDER, OU=Android Apps, O=A.S. GROUP, L=Khorugh, ST=GBAO, C=TJ" >/dev/null 2>&1
  test -s "$KEY_PATH"
  KEYSTORE_BASE64="$(base64 -w0 "$KEY_PATH")"
  echo "::add-mask::$STORE_PASS"
  echo "::add-mask::$KEY_PASS"
  echo "::add-mask::$KEYSTORE_BASE64"
  PAYLOAD="$(jq -n --arg keystoreBase64 "$KEYSTORE_BASE64" --arg storePassword "$STORE_PASS" --arg keyPassword "$KEY_PASS" --arg keyAlias "$KEY_ALIAS" '{keystoreBase64:$keystoreBase64,storePassword:$storePassword,keyPassword:$keyPassword,keyAlias:$keyAlias}')"
  HTTP_STATUS="$(curl --silent --show-error --max-time 30 -X PUT "$KEY_URL" -H "Authorization: Bearer $OIDC_TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" -o "$RESPONSE_FILE" -w '%{http_code}' --data-binary "$PAYLOAD")"
  unset PAYLOAD KEYSTORE_BASE64
  if [ "$HTTP_STATUS" != "201" ] && [ "$HTTP_STATUS" != "409" ]; then
    echo "::error::Could not initialize the permanent signing key. HTTP $HTTP_STATUS."
    exit 1
  fi
  HTTP_STATUS="$(curl --silent --show-error --max-time 30 -H "Authorization: Bearer $OIDC_TOKEN" -H "Accept: application/json" -o "$RESPONSE_FILE" -w '%{http_code}' "$KEY_URL")"
fi

if [ "$HTTP_STATUS" != "200" ]; then
  ERROR_MESSAGE="$(jq -r '.error // "no safe error detail"' "$RESPONSE_FILE" 2>/dev/null || true)"
  echo "::error::Permanent signing key service returned HTTP $HTTP_STATUS: $ERROR_MESSAGE"
  exit 1
fi

STORE_PASS="$(jq -er '.storePassword' "$RESPONSE_FILE")"
KEY_PASS="$(jq -er '.keyPassword' "$RESPONSE_FILE")"
KEY_ALIAS="$(jq -er '.keyAlias' "$RESPONSE_FILE")"
KEYSTORE_BASE64="$(jq -er '.keystoreBase64' "$RESPONSE_FILE")"
echo "::add-mask::$STORE_PASS"
echo "::add-mask::$KEY_PASS"
echo "::add-mask::$KEYSTORE_BASE64"
KEY_PATH="$RUNNER_TEMP/as-builder-signing.p12"
printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$KEY_PATH"
unset KEYSTORE_BASE64
test -s "$KEY_PATH"
keytool -list -keystore "$KEY_PATH" -storetype PKCS12 -storepass "$STORE_PASS" -alias "$KEY_ALIAS" >/dev/null 2>&1 || {
  echo "::error::The stored permanent signing key could not be verified."
  exit 1
}
{
  echo "AS_BUILDER_KEYSTORE_PATH=$KEY_PATH"
  echo "AS_BUILDER_KEYSTORE_PASSWORD=$STORE_PASS"
  echo "AS_BUILDER_KEY_ALIAS=$KEY_ALIAS"
  echo "AS_BUILDER_KEY_PASSWORD=$KEY_PASS"
} >> "$GITHUB_ENV"
rm -f "$RESPONSE_FILE"
echo "Permanent APK signing key is available, verified, and encrypted at rest in the restricted signing service."
