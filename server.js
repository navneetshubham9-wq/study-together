const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();

// ---- Upload folder setup ----
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // files will be saved in /uploads
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// ---- Serve static files (HTML, CSS, JS) ----
app.use(express.static("public"));

// ---- Upload route (ALWAYS JSON) ----
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const fileUrl = `/files/${req.file.filename}`;
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // Dynamic URL बनाओ ताकि दूसरे user को सही link मिले
  const fileUrl = `${req.protocol}://${req.get('host')}/files/${req.file.filename}`;

  res.json({
    message: "File uploaded successfully",
    url: fileUrl
  });
});

  // ✅ सिर्फ JSON भेजो
  res.json({
    message: "File uploaded successfully",
    url: fileUrl
  });
});

// ---- Download route ----
app.get("/files/:filename", (req, res) => {
  res.sendFile(path.join(__dirname, "uploads", req.params.filename));
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
