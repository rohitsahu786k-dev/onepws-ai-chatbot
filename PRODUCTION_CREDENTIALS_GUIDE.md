# Production Environment Credentials Setup Guide

## 🔒 SECURITY SECRETS (Generate New)
Generate secure tokens using:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- **JWT_SECRET**: For signing JWT access tokens
- **JWT_REFRESH_SECRET**: For signing refresh tokens
- **SESSION_SECRET**: For session encryption
- **ENCRYPTION_SECRET**: For general data encryption

---

## 🗄️ DATABASE CONNECTIONS

### MongoDB Production
- **URI Format**: `mongodb://[username:password@]host:port/database`
- **Get from**: Your MongoDB Atlas cluster or self-hosted server
- **Example**: `mongodb://prod-user:secure-pass@mongo.prod.onepws.com:27017/onepws-chatbot?authSource=admin`

### Redis Production
- **Host**: Your Redis server hostname/IP
- **Port**: Default 6379 (or custom)
- **Username/Password**: If using authenticated Redis
- **Get from**: Your Redis provider (AWS ElastiCache, Redis Cloud, etc.)

---

## 🤖 AI & LANGUAGE MODELS

### OpenAI
1. Go to: https://platform.openai.com/api-keys
2. Create new API key
3. **OPENAI_API_KEY**: Your secret key starting with `sk-proj-`
4. **Models**: Use `gpt-4o` for production (latest & best)

### Ollama (Self-hosted alternative)
- **URL**: `http://your-ollama-server:11434/api/generate`
- **Model**: `llama3.2` or your deployed model

---

## 📊 GOOGLE SERVICES

### Google Sheets API (✅ Already Configured)
- **Project ID**: `mail-smtp-455904`
- **Service Account Email**: `google-sheet-api@mail-smtp-455904.iam.gserviceaccount.com`
- **Private Key**: Already set in your .env
- **Sheet IDs**:
  - `GOOGLE_SHEETS_ONEPWS_ID`: `1_c_eksUPElcPS6vB3BzMqpDecsMUwCkCqnDf_B2UCec`
  - `GOOGLE_SHEETS_MASTER_ID`: Get from Google Drive (share with service account)

**Share Google Sheet with Service Account:**
1. Open your sheet in Google Drive
2. Click Share
3. Paste: `google-sheet-api@mail-smtp-455904.iam.gserviceaccount.com`
4. Grant Editor access

---

## 📧 EMAIL CONFIGURATION

### Option A: Gmail + OAuth2
1. Go to: https://console.cloud.google.com
2. Create OAuth 2.0 credentials (Desktop app)
3. Get credentials from Google Cloud Console:
   - **GMAIL_CLIENT_ID**
   - **GMAIL_CLIENT_SECRET**
4. Generate refresh token using OAuth Playground:
   - https://developers.google.com/oauthplayground
   - Authorize with your Gmail account
   - Copy **GMAIL_REFRESH_TOKEN**

### Option B: SMTP (Recommended for Production)
Using Brevo/Sendinblue or similar:
- **SMTP_HOST**: `smtp-relay.brevo.com`
- **SMTP_PORT**: `587`
- **SMTP_USER**: Your Brevo account
- **SMTP_PASS**: SMTP key from Brevo dashboard
- **SMTP_FROM**: Verified sender email

---

## 🏢 ORGANIZATION SETUP

### Department Emails
Set department email addresses for lead routing:
```
DEPT_CONTROL_ROOM_EMAIL=control-room@onepws.com
DEPT_CONSOLES_EMAIL=consoles@onepws.com
DEPT_INTERIORS_EMAIL=interiors@onepws.com
DEPT_FLOORING_EMAIL=flooring@onepws.com
DEPT_MODULAR_OT_EMAIL=modular-ot@onepws.com
DEPT_SUPPORT_EMAIL=support@onepws.com
DEPT_ENTERPRISE_SOLUTIONS_EMAIL=enterprise@onepws.com
```

### Email Distribution
- **MARKETING_CC_EMAIL**: Copy all lead emails to marketing team
- **FALLBACK_LEAD_EMAIL**: Backup if department email fails

---

## 🔐 SECURITY - CAPTCHA

### reCAPTCHA Setup
1. Go to: https://www.google.com/recaptcha/admin
2. Create new site (v3 or v2)
3. Copy **CAPTCHA_SECRET** (server key)

---

## 📋 DEPLOYMENT CHECKLIST

- [ ] Generate all security secrets (JWT, SESSION, ENCRYPTION)
- [ ] Configure MongoDB production URI with credentials
- [ ] Configure Redis production connection
- [ ] Add OpenAI API key
- [ ] Verify Google Sheets credentials and share sheet
- [ ] Configure email service (Gmail OAuth or SMTP)
- [ ] Set department email addresses
- [ ] Set marketing CC and fallback emails
- [ ] Add reCAPTCHA secret
- [ ] Enable all required feature flags
- [ ] Test all connections before going live
- [ ] Use `.env.production` file in production (never commit)
- [ ] Set `NODE_ENV=production` on your production server

---

## ⚠️ IMPORTANT SECURITY NOTES

1. **NEVER commit `.env` files to Git** - Already ignored in `.gitignore`
2. **Use strong, unique secrets** - Not simple strings
3. **Rotate secrets periodically** - Especially for long-lived services
4. **Use secrets management service** - Docker Secrets, AWS Secrets Manager, HashiCorp Vault
5. **Audit API keys** - Check which services have access
6. **Set expiration dates** - For API keys where possible
7. **Monitor usage** - Track API usage and billing

---

## 🚀 DEPLOYMENT FLOW

1. Create production database and Redis instance
2. Fill all credentials in `.env.production`
3. Deploy with: `NODE_ENV=production npm run build`
4. Run tests to verify connections
5. Monitor logs for any connection issues
6. Scale up gradually with monitoring

---

## 📞 TROUBLESHOOTING

**MongoDB Connection Failed?**
- Check host, port, and credentials
- Verify IP whitelist if using MongoDB Atlas
- Test with: `npm run test`

**Redis Connection Failed?**
- Verify Redis is running
- Check username/password if authenticated
- Test connectivity: `redis-cli ping`

**Google Sheets Not Syncing?**
- Verify sheet is shared with service account email
- Check sheet ID is correct
- Review logs for API errors

**Email Not Sending?**
- Check SMTP credentials are correct
- Verify Gmail OAuth tokens are fresh
- Check email from address is verified
- Review email logs in admin dashboard
