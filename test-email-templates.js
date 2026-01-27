const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

// Register Handlebars helpers
handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});

// Test data for each template
const testData = {
  welcome: {
    templateName: 'welcome',
    context: {
      userName: 'John Doe',
      appName: 'BrandBanda',
      loginUrl: 'https://app.example.com/login',
    },
  },
  invoice: {
    templateName: 'invoice',
    context: {
      invoiceNumber: 'INV-TEST-001',
      invoiceDate: new Date().toLocaleDateString(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      customerName: 'John Doe',
      items: [
        {
          description: 'Web Design Service',
          quantity: 2,
          unitPrice: 150,
          amount: 300,
        },
        {
          description: 'SEO Optimization',
          quantity: 1,
          unitPrice: 200,
          amount: 200,
        },
      ],
      currency: 'USD',
      subtotal: 500,
      tax: 25,
      taxRate: 5,
      total: 525,
      status: 'pending',
      appName: 'BrandBanda',
    },
  },
  subscription: {
    templateName: 'subscription',
    context: {
      subscriptionType: 'new',
      userName: 'John Doe',
      planName: 'Premium Plan',
      planDescription: 'All features included with priority support',
      price: 29.99,
      currency: 'USD',
      billingCycle: 'monthly',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      status: 'active',
      features: [
        'Unlimited projects',
        'Priority support',
        'Advanced analytics',
        'Custom integrations',
      ],
      dashboardUrl: 'https://app.example.com/dashboard',
      manageSubscriptionUrl: 'https://app.example.com/settings/subscription',
      appName: 'BrandBanda',
    },
  },
  'project-invitation': {
    templateName: 'project-invitation',
    context: {
      userName: 'John Doe',
      inviterName: 'Jane Smith',
      projectName: 'Q1 Marketing Campaign',
      invitationUrl: 'https://app.example.com/invitations/accept/test-token-123',
      appName: 'BrandBanda',
    },
  },
};

function renderTemplate(templateName, context) {
  try {
    const templatePath = path.join(__dirname, 'src/templates/emails', `${templateName}.hbs`);
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    const html = template(context);
    return { success: true, html };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

console.log('\n='.repeat(80));
console.log('🧪 EMAIL TEMPLATE TESTING');
console.log('='.repeat(80));

let allTestsPassed = true;

// Test each template
Object.keys(testData).forEach((key) => {
  const { templateName, context } = testData[key];

  console.log(`\n📧 Testing ${templateName}.hbs...`);
  console.log('-'.repeat(80));

  const result = renderTemplate(templateName, context);

  if (result.success) {
    console.log(`✅ SUCCESS: Template rendered successfully`);
    console.log(`   - File: src/templates/emails/${templateName}.hbs`);
    console.log(`   - Size: ${(result.html.length / 1024).toFixed(2)} KB`);
    console.log(`   - Variables populated: ${Object.keys(context).join(', ')}`);

    // Check for unrendered Handlebars variables
    const unresolvedVars = result.html.match(/\{\{[^}]+\}\}/g);
    if (unresolvedVars && unresolvedVars.length > 0) {
      console.log(`   ⚠️  WARNING: Found unresolved variables: ${unresolvedVars.join(', ')}`);
      allTestsPassed = false;
    }

    // Check for Handlebars syntax errors
    if (result.html.includes('{{#') || result.html.includes('{{/')) {
      console.log(`   ⚠️  WARNING: Template may have unclosed Handlebars blocks`);
      allTestsPassed = false;
    }
  } else {
    console.log(`❌ FAILED: ${result.error}`);
    allTestsPassed = false;
  }
});

console.log('\n' + '='.repeat(80));
if (allTestsPassed) {
  console.log('✅ ALL TESTS PASSED - All templates render correctly!');
  console.log('='.repeat(80));
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED - Please review the errors above');
  console.log('='.repeat(80));
  process.exit(1);
}
