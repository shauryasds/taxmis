const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
require('dotenv').config();
const path = require('path');
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const app = express();
const port = process.env.PORT || 8000;
app.use(bodyParser.json({ limit: '10mb' }));

app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

let db;

const connectDB = () => {
  db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    port: process.env.MYSQLPORT,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE
  });

  db.connect(err => {
    if (err) {
      console.error('Database connection failed:', err);
      // Retry after 2 seconds
      setTimeout(connectDB, 2000);
      return;
    }
    console.log('MySQL Connected...');

    // Create tables if not exists
    db.query(`
      CREATE TABLE IF NOT EXISTS leads (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          mobile VARCHAR(15) NOT NULL,
          father_name VARCHAR(255),
          spouse_name VARCHAR(255),
          mother_name VARCHAR(255),
          aadhar VARCHAR(20),
          pan VARCHAR(20),
          company_name VARCHAR(255),
          email VARCHAR(255) NOT NULL,
          gst VARCHAR(20),
          cin VARCHAR(20),
          services JSON NOT NULL,
          note TEXT,
          is_customer BOOLEAN DEFAULT FALSE,
          documents TEXT,
          assigned_to VARCHAR(255),
          delivery_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, (error) => {
      if (error) {
        console.error('Error creating table:', error);
        return;
      }
      console.log('Leads table verified');
    });
  });
};

connectDB();

// Admin credentials
const adminUser = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123'
};

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.authenticated) return res.redirect('/login');
  next();
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === adminUser.username && password === adminUser.password) {
    req.session.authenticated = true;
    res.redirect('/dashboard');
  } else {
    res.send('Invalid credentials');
  }
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/new-leads', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'new-leads.html'));
});

app.get('/customers', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customers.html'));
});

app.get('/add-services', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add-services.html'));
});

app.get('/convert-customer/:id', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'convert-customer.html'));
});
app.get('/details-customer/:id', requireAuth, (req, res) => {
  
  res.sendFile(path.join(__dirname, 'public', 'details-customer.html'));
});


app.get('/edit/:id', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'edit-lead.html'));
});

// API endpoints
app.get('/api/leads', requireAuth, (req, res) => {
  db.query('SELECT * FROM leads WHERE is_customer = FALSE', (err, leads) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    res.json(leads);
  });
});

app.get('/api/customers', requireAuth, (req, res) => {
  db.query('SELECT * FROM leads WHERE is_customer = TRUE', (err, customers) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    res.json(customers);
  });
});

app.get('/api/lead/:id', requireAuth, (req, res) => {
  db.query('SELECT * FROM leads WHERE id = ?', [req.params.id], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    res.json(result[0]);
  });
});

app.post('/submit', (req, res) => {
  const { customer, services } = req.body;
  
  // Validate required fields
  if (!customer.customerName || !customer.mobile || !customer.email) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const leadData = {
    customer_name: customer.customerName,
    mobile: customer.mobile,
    father_name: customer.fatherName,
    spouse_name: customer.spouseName,
    mother_name: customer.motherName,
    aadhar: customer.aadhar,
    pan: customer.pan,
    company_name: customer.company,
    email: customer.email,
    gst: customer.gst,
    cin: customer.cin,
    services: JSON.stringify(services),
    note: customer.note
  };

  db.query(
    `INSERT INTO leads SET ?`,
    leadData,
    (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error saving lead' });
      }
      res.status(200).json({ 
        message: 'Lead submitted successfully!',
        leadId: result.insertId
      });
    }
  );
});

app.post('/update/:id', requireAuth, async (req, res) => {
  const { customer, services, documents = [], isCustomer } = req.body;
  
  // Validate required fields
  if (!customer.customerName || !customer.mobile || !customer.email) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const leadData = {
      customer_name: customer.customerName,
      mobile: customer.mobile,
      father_name: customer.fatherName,
      spouse_name: customer.spouseName,
      mother_name: customer.motherName,
      aadhar: customer.aadhar,
      pan: customer.pan,
      company_name: customer.company,
      email: customer.email,
      gst: customer.gst,
      cin: customer.cin,
      services: JSON.stringify(services),
      note: customer.note,
      is_customer: isCustomer || false
    };

    // Handle document uploads if converting to customer
    if (isCustomer) {
      const uploadPromises = documents.map(doc => {
        const mimeType = getMimeType(doc);
        return cloudinary.uploader.upload(`data:${mimeType};base64,${doc}`, {
          resource_type: 'auto'
        });
      });

      const uploadResults = await Promise.all(uploadPromises);
      const documentUrls = uploadResults.map(result => ({
        name: customer.documentName || 'Document',
        path: result.secure_url
      }));

      leadData.documents = JSON.stringify(documentUrls);
      leadData.assigned_to = customer.assignedTo;
      leadData.delivery_date = customer.deliveryDate;
    }

    db.query(
      `UPDATE leads SET ? WHERE id = ?`,
      [leadData, req.params.id],
      (err, result) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ message: 'Error updating lead' });
        }
        res.status(200).json({ 
          message: 'Lead updated successfully!'
        });
      }
    );
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ message: 'Error uploading documents' });
  }
});

app.post('/convert-customer/:id', async (req, res) => {
  const { documentName, employee, deliveryDate, documents } = req.body;

  try {
    // Upload each document to Cloudinary
    const uploadPromises = documents.map((doc, index) => {
      // Determine the MIME type based on the file extension
      const mimeType = getMimeType(doc); // Create a function to get the MIME type
      return cloudinary.uploader.upload(`data:${mimeType};base64,${doc}`, {
        resource_type: 'auto' // Automatically determine the resource type (image, video, etc.)
      });
    });

    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);

    // Extract the URLs from the upload results
    const documentUrls = uploadResults.map(result => ({
      name: documentName, // You may want to customize this for each document
      path: result.secure_url // Get the secure URL of the uploaded document
    }));

    const updateData = {
      is_customer: true,
      assigned_to: employee,
      delivery_date: deliveryDate,
      documents: JSON.stringify(documentUrls) // Store the URLs in the database
    };

    db.query('UPDATE leads SET ? WHERE id = ?', [updateData, req.params.id], (err) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error converting to customer' });
      }
      res.status(200).json({ message: 'Lead converted to customer successfully' });
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ message: 'Error uploading documents to Cloudinary' });
  }
});

// Function to get MIME type based on file extension
function getMimeType(base64String) {
  // You may need to implement a more robust way to determine the MIME type
  // For example, you could use a library or a mapping of file extensions to MIME types
  // Here is a simple example:
  const extension = base64String.split(';')[0].split('/')[1];
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    // Add more cases as needed
    default:
      return 'application/octet-stream'; // Fallback for unknown types
  }
}

app.get('/delete/:id', requireAuth, async (req, res) => {
  try {
    // Step 1: Retrieve the lead to get the document URLs
    const [lead] = await new Promise((resolve, reject) => {
      db.query('SELECT documents FROM leads WHERE id = ?', [req.params.id], (err, result) => {
        if (err) {
          return reject(err);
        }
        resolve(result);
      });
    });

    if (lead && lead.documents) {
      

    // Step 2: Parse the documents and delete them from Cloudinary
    const documents = JSON.parse(lead.documents);
    const deletePromises = documents.map(doc => {
      const publicId = doc.path.split('/').pop().split('.')[0]; // Extract public ID from URL
      console.log(publicId);
      return cloudinary.uploader.destroy(publicId)
        .then(result => {
          console.log(`Deleted ${publicId}:`, result);
          return result;
        })
        .catch(err => {
          console.error(`Error deleting ${publicId}:`, err);
          return null; // Return null for failed deletions
        });
    });
  
    const deleteResults = await Promise.all(deletePromises); // Wait for all deletions to complete
    console.log('Delete results:', deleteResults);
    // Log results of deletions
  }

    // Step 3: Delete the lead from the database
    db.query('DELETE FROM leads WHERE id = ?', [req.params.id], (err) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Error deleting lead');
      }
      res.status(200).send('Lead and associated documents deleted successfully');
    });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).send('Error deleting lead');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// API endpoint to delete all files from Cloudinary
app.get('/api/delete-all-files', async (req, res) => {
  try {
    // Fetch all public IDs of the resources you want to delete
    // You can modify this to fetch specific resources if needed
    const result = await cloudinary.api.resources({
      type: 'upload', // Specify the type of resources to delete
      max_results: 500 // Adjust this number based on your needs
    });

    const publicIds = result.resources.map(resource => resource.public_id);

    if (publicIds.length === 0) {
      return res.status(404).json({ message: 'No files found to delete' });
    }

    // Delete all resources using their public IDs
    const deleteResult = await cloudinary.api.delete_resources(publicIds);

    res.status(200).json({
      message: 'All files deleted successfully',
      deleted: deleteResult.deleted,
      not_deleted: deleteResult.not_deleted
    });
  } catch (error) {
    console.error('Error deleting files from Cloudinary:', error);
    res.status(500).json({ message: 'Error deleting files from Cloudinary' });
  }
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
