const axios = require('axios');

// Test data
const testData = {
  firstName: "John",
  email: "ahsan@thebeacons.org",
  phone: "1234567890",
  businessName: "Example Business",
  businessType: "Technology",
  websiteLink: "https://example.com"
};

// Test the API
async function testAPI() {
  try {
    console.log('Testing API with data:', testData);
    
    const response = await axios.post(
      'http://localhost:3000/api/generate-report',
      testData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('API Response:', response.data);
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAPI();