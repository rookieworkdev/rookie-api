# New trigger deployment test after making repo public again

# Rookie Recruitment Webhook

A production-ready Express.js implementation of the Rookie recruitment lead processing workflow, converted from N8n.

## Overview

This service processes recruitment form submissions through an intelligent workflow:

1. **Validates** submitted data and performs spam detection
2. **Classifies** leads using OpenAI (valid lead, candidate, invalid, or spam)
3. **Manages** company records in Supabase
4. **Generates** job ad drafts using AI
5. **Sends** professional email confirmations via Gmail

## Architecture

```
Webhook Endpoint
  ↓
Data Validation & Spam Check
  ↓
AI Classification (OpenAI)
  ↓
Company Management (Supabase)
  ↓
Switch: valid_lead | invalid_lead | likely_candidate | likely_spam
  ↓
[Valid Lead Path]
  → Contact Upsert
  → Job Ad Generation (OpenAI)
  → Database Insert
  → Email Send (Gmail)
```

## Prerequisites

- Node.js 18+
- OpenAI API key
- Supabase project with required tables
- Gmail account with App Password

## Installation

```bash
# Clone or copy the project
cd recruitment-webhook

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

## Environment Variables

### Required

```env
OPENAI_API_KEY=sk-...           # Your OpenAI API key
SUPABASE_KEY=eyJ...             # Supabase anon/service key
GMAIL_USER=you@gmail.com        # Gmail address
GMAIL_APP_PASSWORD=xxxx...      # Gmail app-specific password
```

### Optional

```env
PORT=3000                       # Server port (default: 3000)
NODE_ENV=production             # Environment mode
WEBHOOK_SECRET=abc123           # Optional webhook verification
ALLOWED_ORIGINS=https://...     # CORS origins
```

## Gmail Setup

To send emails, you need a Gmail App Password:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication
3. Go to "App passwords"
4. Create a new app password for "Mail"
5. Copy the 16-character password to `GMAIL_APP_PASSWORD`

## Supabase Setup

### Required Tables

Your Supabase database needs these tables:

#### 1. `companies`

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  domain TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. `signals`

```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  signal_type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. `rejected_leads`

```sql
CREATE TABLE rejected_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  submitted_description TEXT,
  source TEXT NOT NULL,
  classification TEXT,
  ai_reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. `candidate_leads`

```sql
CREATE TABLE candidate_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  submitted_description TEXT,
  ai_reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 5. `contacts`

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  full_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, email)
);
```

#### 6. `job_ads`

```sql
CREATE TABLE job_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT,
  company TEXT,
  location TEXT,
  category TEXT,
  source TEXT,
  external_id TEXT,
  external_url TEXT,
  published_status TEXT DEFAULT 'draft',
  ai_valid BOOLEAN DEFAULT false,
  ai_score INTEGER,
  ai_reasoning TEXT,
  ai_category TEXT,
  service_type TEXT,
  is_ai_generated BOOLEAN DEFAULT false,
  raw_data JSONB,
  posted_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Required Stored Procedure

Create the `find_or_create_company` function:

```sql
CREATE OR REPLACE FUNCTION find_or_create_company(
  p_name TEXT,
  p_domain TEXT,
  p_source TEXT DEFAULT 'website_form'
)
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Try to find existing company by domain
  IF p_domain IS NOT NULL THEN
    SELECT id INTO v_company_id
    FROM companies
    WHERE domain = p_domain
    LIMIT 1;
  END IF;

  -- If not found by domain, try by name
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM companies
    WHERE LOWER(name) = LOWER(p_name)
    LIMIT 1;
  END IF;

  -- If still not found, create new company
  IF v_company_id IS NULL THEN
    INSERT INTO companies (name, domain, source)
    VALUES (p_name, p_domain, p_source)
    RETURNING id INTO v_company_id;
  END IF;

  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql;
```

## Usage

### Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### API Endpoints

#### POST /api/webhook

Main webhook endpoint for form submissions.

**Request Body:**

```json
{
	"name": "John Doe",
	"email": "john@company.com",
	"phone": "+46701234567",
	"company": "Tech AB",
	"industry": "technology",
	"service_type": "direktrekrytering",
	"message": "We need to hire a senior developer...",
	"subject": "Recruitment inquiry"
}
```

**Response (Valid Lead):**

```json
{
	"success": true,
	"message": "Valid lead processed successfully",
	"classification": "valid_lead",
	"lead_score": 85,
	"job_ad_title": "Senior Developer",
	"processingTime": 3450
}
```

**Response (Spam):**

```json
{
	"success": true,
	"message": "Lead classified as spam",
	"classification": "likely_spam",
	"processingTime": 1200
}
```

#### GET /api/health

Health check endpoint.

**Response:**

```json
{
	"status": "healthy",
	"timestamp": "2026-01-28T10:30:00.000Z"
}
```

## Testing

### Manual Test

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "0701234567",
    "company": "Test AB",
    "industry": "technology",
    "service_type": "direktrekrytering",
    "message": "We need a software developer with 3 years experience",
    "subject": "General inquiry"
  }'
```

### Test Cases

The original N8n flow included this test data:

```javascript
{
  "name": "X",
  "email": "spamuser@fake.com",
  "phone": "abc123",
  "company": "A",
  "industry": "manufacturing",
  "service_type": "direktrekrytering",
  "message": "Buy now http://spamlink.com Viagra deals!",
  "consent": true,
  "subject": "Allmän förfrågan"
}
```

Expected: Classified as spam (fast reject)

## Project Structure

```
recruitment-webhook/
├── src/
│   ├── config/
│   │   └── env.js              # Environment configuration
│   ├── routes/
│   │   └── webhook.js          # Main webhook route
│   ├── services/
│   │   ├── aiService.js        # OpenAI integration
│   │   ├── supabaseService.js  # Database operations
│   │   └── emailService.js     # Gmail sending
│   ├── utils/
│   │   ├── validator.js        # Data validation & processing
│   │   └── logger.js           # Structured logging
│   └── index.js                # Express app & server
├── .env                        # Environment variables (create this)
├── .env.example               # Environment template
├── package.json
└── README.md
```

## Lead Classification Logic

The AI classifies leads into 4 categories:

### 1. `valid_lead`

- Professional recruitment needs
- White-collar roles (ekonom, ingenjör, tekniker, etc.)
- Company email domain preferred
- **Action:** Generate job ad, send email

### 2. `invalid_lead`

- Personal email + no company context
- Out-of-scope roles (manual labor, healthcare, teaching)
- **Action:** Store in rejected_leads

### 3. `likely_candidate`

- Job seekers (not employers)
- Personal email describing themselves
- **Action:** Store in candidate_leads

### 4. `likely_spam`

- Promotional content
- Malicious links
- Incoherent text
- **Action:** Store in rejected_leads (spam)

## Deployment

### Docker (Recommended)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src ./src
EXPOSE 3000
CMD ["node", "src/index.js"]
```

Build and run:

```bash
docker build -t rookie-webhook .
docker run -p 3000:3000 --env-file .env rookie-webhook
```

### Traditional VPS

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Setup application
git clone <your-repo>
cd recruitment-webhook
npm install --production

# Use PM2 for process management
npm install -g pm2
pm2 start src/index.js --name rookie-webhook
pm2 save
pm2 startup
```

### Vercel/Railway/Render

1. Connect your Git repository
2. Set environment variables in the dashboard
3. Deploy (they auto-detect Express apps)

## Monitoring

Logs are output as structured JSON:

```json
{
  "level": "info",
  "message": "Webhook received",
  "timestamp": "2026-01-28T10:30:00.000Z",
  "body": {...}
}
```

Recommended: Send logs to a service like:

- Datadog
- Logtail
- CloudWatch
- Papertrail

## Security Considerations

1. **Rate Limiting:** 100 requests per 15 minutes per IP
2. **CORS:** Configure `ALLOWED_ORIGINS` for production
3. **Helmet:** Security headers enabled
4. **API Keys:** Never commit `.env` to version control
5. **Webhook Secret:** Optional signature verification

## Differences from N8n

This implementation:

- ✅ Exact same logic and prompts
- ✅ Same classification criteria
- ✅ Same database operations
- ✅ Same email template
- ✅ Better error handling
- ✅ Structured logging
- ✅ Rate limiting & security
- ✅ Production-ready code

## Performance

Expected processing times:

- **Fast Reject (spam):** ~50-200ms
- **Invalid/Candidate:** ~2-4 seconds (1 AI call)
- **Valid Lead:** ~8-12 seconds (2 AI calls + email)

## Troubleshooting

### "Missing required environment variables"

Make sure all variables in `.env.example` are set in your `.env` file.

### "AI scoring failed"

Check your OpenAI API key and quota. The service uses `gpt-4o-mini` model.

### "Failed to find/create company"

Verify the `find_or_create_company` stored procedure exists in Supabase.

### "Failed to send email"

Ensure Gmail App Password is correct (not your regular password).

## Support

For issues or questions:

- Check logs (structured JSON output)
- Verify environment variables
- Test with the provided curl command
- Check Supabase table schemas

## License

MIT

## Credits

Converted from N8n workflow for Rookie AB recruitment agency.
