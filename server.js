const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

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
    const formData = req.body;
    
    // Validate required fields
    if (!formData.firstName || !formData.email || !formData.phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const contact = await createContact(formData);
    console.log("contact:", contact.contact.id);

    // Generate AI report
    const report = await generateAIReport(formData);
    
    // Generate PDF
    const pdfURL = await generateAndUploadPDF(report, formData);
    
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
    const { email, firstName, lastName, phone } = formData;
    const name = `${firstName} ${lastName}`.trim();
    
    const contactData = {
      email: email.toLowerCase().trim(),
      name: name.trim(),
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

// Function to generate AI report using OpenAI
async function generateAIReport(formData) {
  try {
    const prompt = `
        You are an AI business advisor who specializes in helping small local businesses use AI to grow revenue, save time, and improve customer experience.
        I will give you:

        - The business name
        - The business type
        - The business website (if available)

        Use this information to create a 100% tailored “AI Opportunity Report” for this business.
        The report should be specific, clear, actionable, and realistic — written for a non-technical business ownerwith 1-50 employees.

        Inputs:
        Business name: ${formData.businessName || 'N/A'}
        Business type: ${formData.businessType || 'N/A'}
        Website: ${formData.websiteLink || 'N/A'}

        REPORT STRUCTURE:
        1. Introduction
        Explain what's happening in their market right now with AI.
        Use plain language and give 2-3 examples of how businesses like theirs are already using AI.
        Mention how fast AI adoption is growing (reference current data or trend percentages).
        2. The Threats
        Outline the key business risks and challenges if they ignore AI.
        Include:
        Competitors using AI to attract more customers
        Clients expecting faster service, better communication, and 24/7 responsiveness
        Time and cost pressures
        The danger of losing local market share and lower business valuation
        3. Why It's Hard for Small Businesses
        Explain that small business owners rarely get practical help with AI.
        Mention:
        Most IT consultants focus on websites, not business growth
        AI advice online is too technical
        Business owners are too busy to learn new tools
        Emphasize: this is not about tech — it's about smarter business operations.
        4. Big Opportunities
        Give 3-5 clear, realistic ideas for how this specific type of business could use AI.
        Each idea should include:
        The AI tool or approach (e.g. lead follow-up automation, customer service chat, scheduling, marketing, reporting)
        The benefit (e.g. “turn missed calls into booked jobs,” “free up 10 hours a week,” “increase repeat business”)
        Use examples relevant to ${formData.businessType || 'N/A'}.
        5. The Payoff
        Explain what happens if they start small now.
        Use bullet points and numbers where possible:
        20-50% time savings
        30-200% more leads from better marketing
        Less stress for the team
        Happier customers and higher business value
        6. Call to Action
        End with an encouraging paragraph.
        Reinforce that they don't need to become an AI expert — they just need to start now.
        Mention that you (the sender) can help them take the next steps if they want.

        Tone:
        Friendly and expert, not salesy
        No jargon
        Grade 6 reading level
        Short paragraphs and bullet points
        American English

        Output:
        Return as a full written report titled:
        “Your AI Opportunity Report — For ${formData.businessName || 'N/A'}"
        Use clear formatting with subheadings and spacing and dont include * or # in heading on points.
    `;
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert AI risk analyst and business consultant."
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
    .text(`Business Type: ${formData.businessType || 'N/A'}`)
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
  const fileName = `Business_AI_Report_${Date.now()}.pdf`;
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
    pdfUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/reports/${formData.businessName}.pdf`
    console.log(pdfUrl);

    // Prepare message data for GHL Conversations API
    const messageData = {
      type: "Email",
      contactId: contactId,
      subject: process.env.EMAIL_SUBJECT || "Your AI Business Report",
      html: `
          <p>Hello ${formData.firstName},</p>
          <p>Your personalized business report is attached to this email.</p>
          <p>Best regards,<br>Edwards</p>
        `,
      to: formData.email,
      from: process.env.EMAIL_FROM,
      attachments: [
        //`${process.env.BASE_URL}/public/Business_AI_Report.pdf`
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