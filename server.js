const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Load environment variables
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
// Initialize Express app
const app = express();
//app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use(
  '/public',
  express.static(path.join(process.cwd(), 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.pdf')) {
        const fileName = path.basename(filePath); // ✅ just the filename
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      }
    },
  })
);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API endpoint to generate report and send email
app.post('/api/generate-report', async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const formData = req.body;

    if(!formData.firstName){
      formData.firstName = "Undefined"
    }
    if(!formData.lastName){
      formData.lastName = "test@example.com"
    }
    if(!formData.phone){
      formData.phone = "+1 (804) 222-1111"
    }
    
    // Validate required fields
    if (!formData.firstName || !formData.email || !formData.phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const contact = await createContact(formData);
    console.log("contact:", contact.contact.id);

    // Generate AI report
    const report = await generateAIReport(formData);

    const cleanReport = report.replace(/[*#]/g, '')  
    
    // Generate PDF
    const pdfURL = await generateAndUploadPDF(cleanReport, formData);
    
    // Send email with PDF attachment
    await sendEmailWithPDFReport(contact.contact.id, formData, pdfURL);
    
    // Clean up - delete the temporary PDF file
    //fs.unlinkSync(pdfPath);
    
    // Return success response
    res.status(200).json({ 
      success: true, 
      message: 'Report generated and email sent successfully' 
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'An error occurred', 
      message: error.message 
    });
  }
});

// Create contact in GoHighLevel
async function createContact(formData){
    const { firstName, email, phone } = formData;
    
    const contactData = {
      name: firstName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone,
      tags: ['AI Opportunity Report']
    }
    console.log(contactData);

    // Make API call to GoHighLevel
    const response = await fetch(`https://rest.gohighlevel.com/v1/contacts/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GHL_API_KEY}`
      },
      body: JSON.stringify(contactData)
    })
    
    const responseClone = response.clone();
    const responseData = await responseClone.json();
    console.log("GoHighLevel API Response:", JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      const errorData = await response.json();
      console.error('GoHighLevel API error:', errorData)
      return errorData;
    }

    return responseData
}

/**
 * Fetch and extract visible text from a website for AI analysis.
 * Cleans out scripts, menus, and redundant text.
 */
async function fetchWebsiteContent(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 10000, // 10 sec timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (AI Analyzer Bot)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const $ = cheerio.load(data);

    // Remove scripts, styles, nav, and footer
    $('script, style, nav, footer, noscript').remove();

    // Get main textual content
    const text = $('body').text();
    const cleaned = text
      .replace(/\s+/g, ' ')
      .replace(/([^\x00-\x7F]|\r|\n)/g, ' ') // remove non-ASCII
      .trim();

    // Limit to ~6000 chars (about 1500 tokens)
    return cleaned.slice(0, 6000);

  } catch (err) {
    console.error(`Error fetching website: ${url}`, err.message);
    return "Website content could not be fetched.";
  }
}

// Function to generate AI report using OpenAI
async function generateAIReport(formData) {
  try {
    //const websiteText = await fetchWebsiteContent(formData.websiteLink);
    console.log("websiteLink", formData.websiteLink)
    
    const prompt=`
      You are an AI business analyst that helps companies uncover high-impact ways to use AI.

      The user will give you a company website URL.
      Your job is to analyze that website and produce a concise, structured report showing exactly where AI can create measurable impact — fast.

      ${formData.websiteLink}

      Follow these steps carefully:

      ⸻

      Step 1. Identify Core Details

      From the website, determine:
        •	Industry / Niche
        •	Primary Location or Service Area
        •	Core Offering — what they actually sell or do
        •	Target Audience / Customer Type

      ⸻

      Step 2. Diagnose Typical Pain Points

      List 4-5 major problems that companies in this niche commonly face.
      For each problem:
        •	Summarize it in one sentence.
        •	Use supporting data or benchmarks from credible sources (industry reports, statistics, or case studies).
        •	Keep numbers simple and clear (e.g., “average law firm loses 20% of billable hours to admin work”).

      ⸻

      Step 3. Match Each Problem to a Specific AI Solution

      For each problem, describe:
        •	A specific AI-driven solution that directly addresses it.
        •	How quickly it can be implemented (e.g., “can be live within 7 days”).
        •	The tangible outcome (time saved, cost reduced, revenue gained, or risk lowered).

      ⸻

      Step 4. Deliver Action-Oriented Framing

      Add a short paragraph that:
        •	Reinforces that these issues can be solved fast — often in days or weeks, not months.
        •	Positions AI as a competitive advantage for their specific type of business.

      ⸻

      Step 5. Call to Action

      End with:

      “To explore how these solutions can be implemented in your business within days, contact us at ${process.env.EMAIL_FROM}.”

      ⸻

      Output Format

      Respond in Markdown with:
        1.	Industry Summary
        2.	Location & Core Offering
        3.	Top 5 Problems & AI Solutions
        4.	Conclusion & Call to Action

      Tone: professional, practical, and data-backed. No hype.
      Keep it under 1000 words total
    `;
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an AI business analyst that helps companies uncover high-impact ways to use AI."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 1500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating AI report:', error.response?.data || error.message);
    throw new Error('Failed to generate AI report');
  }
}

async function generateAndUploadPDF(reportText, formData) {
  // 1️⃣ Generate PDF in-memory
  const doc = new PDFDocument();
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', async () => {});

  doc.fontSize(20).text("Business Analysis Report", { align: 'center' }).moveDown(2);
  doc.fontSize(12)
    .text(`Business Name: ${formData.businessName || 'N/A'}`)
    .text(`Website: ${formData.websiteLink || 'N/A'}`)
    .moveDown(2);
  doc.fontSize(10).text(reportText, { align: 'left' });

  doc.end();

  const pdfBuffer = await new Promise((resolve, reject) => {
    const result = [];
    doc.on('data', (chunk) => result.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(result)));
    doc.on('error', reject);
  });

  // 2️⃣ Upload PDF to Supabase Storage
  const fileName = `${formData.businessName.replace(/\s+/g, '_')}.pdf`;
  const { data, error } = await supabase
    .storage
    .from('reports') // your bucket name
    .upload(fileName, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) throw error;

  // 3️⃣ Get public URL
  const { publicUrl, error: urlError } = supabase
    .storage
    .from('reports')
    .getPublicUrl(fileName);

  if (urlError) throw urlError;

  return publicUrl;
}

// Function to send email with PDF attachment using GHL API
async function sendEmailWithPDFReport(contactId, formData, pdfUrl) {
  try {  
    const fileName = `${formData.businessName.replace(/\s+/g, '_')}.pdf`;
    pdfUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/reports/${fileName}`
    console.log(pdfUrl);

    // Prepare message data for GHL Conversations API
    const messageData = {
      type: "Email",
      contactId: contactId,
      subject: process.env.EMAIL_SUBJECT || "Your AI Business Report",
      html: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <p>Hello ${formData.firstName.split(' ')[0]},</p>
            <p>Your personalized business report is attached to this email.</p>
            <p>Best regards,<br><strong>Edwards</strong></p>

            <div style="text-align: left; margin-bottom: 10px; margin-bottom: 10px;">
              <img src="${process.env.SUPABASE_URL}/storage/v1/object/public/reports/The_Local_AI_Squad_Logo.png" 
              alt="Company Logo" width="150" style="border-radius: 8px;" />
            </div>
          </div>
        `,
      to: formData.email,
      from: process.env.EMAIL_FROM,
      attachments: [
        pdfUrl
      ]
    };
    
    // Call GHL Conversations API to send email with attachment
    const response = await axios.post(
      'https://services.leadconnectorhq.com/conversations/messages',
      messageData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GHL_TOKEN}`,
          'Version': '2021-07-28'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error sending email:', error.response?.data || error.message);
    throw new Error('Failed to send email: ' + (error.response?.data?.message || error.message));
  }
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});