const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();

// Storage setup for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads'); // files will be saved in uploads folder
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/files', express.static(path.join(__dirname, 'uploads')));

// Upload route
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // Dynamic URL for Render (works for all users)
  const fileUrl = `${req.protocol}://${req.get('host')}/files/${req.file.filename}`;

  res.json({
    message: "File uploaded successfully",
    url: fileUrl
  });
});

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Port setup for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
