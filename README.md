# AI Report Generator API

This API generates AI business reports using OpenAI and sends them as PDF attachments via the GHL API.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your OpenAI API key and GHL API key

3. Start the server:
   ```
   npm start
   ```

## API Endpoints

### Generate Report and Send Email

**Endpoint:** `POST /api/generate-report`

**Request Body:**
```json
{
  "firstName": "John",
  "email": "john@example.com",
  "phone": "1234567890",
  "businessName": "Example Business",
  "businessType": "Technology",
  "websiteLink": "https://example.com"
}
```

**Required Fields:**
- firstName
- email
- phone

**Response:**
```json
{
  "success": true,
  "message": "Report generated and email sent successfully"
}
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- 400: Missing required fields
- 500: Server error (with error message)