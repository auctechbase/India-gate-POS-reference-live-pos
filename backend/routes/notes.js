const express = require("express");
const Note = require('../models/Note');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs')

const fetchuser = require('../middlewares/loggedIn');
const config = require('../config');
const { removeStored } = require('../utils/images');
const sharp = require("sharp");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(config.tmpDir, 'temp')); // Directory where files will be stored
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '.webp'); // Save file with unique name
    }
})

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
      // Validate file type (optional)
      const fileTypes = /jpeg|jpg|png|webp/;
      const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = fileTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Only jpeg|jpg|png|webp images are allowed!'));
    }
}).single('image');
  
router.get('/', async (req,res) => {
    try {  
        const notes = await Note.query();
        return res.json({status:true, notes });
    } catch (e) {
        console.log("exception occured: ",e)
        return res.status(400).json({ status: false, message: e.message })        
    }
});

// Route 3 : Get logged in user details - login required
router.post('/create', fetchuser, async(req, res) => {
    upload(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
          return res.status(500).json({ error: 'File too large. Max size is 2MB.' });
        } else if (err) {
          return res.status(500).json({ error: err.message });
        }
    
        if (!req.file) {
          return res.status(500).json({ error: 'No file uploaded.' });
        }
    
        try {
          const { filename, path: tempPath } = req.file;
          const outputFile = path.join(config.tmpDir, 'notes', filename);
    
          // Convert and save as webp
          await sharp(tempPath)
            .webp({ quality: 35 })
            .toFile(outputFile);
    
          // Delete original file
          try {
              fs.unlinkSync(tempPath);
          } catch (e) {}
    
          // Save note to DB
          const note = await Note.query().insert({
            amount: req.body.amount,
            image: "notes/" + filename,
            status: req.body.status ?? true,
          });
    
          return res.json({ status: true, note });
    
        } catch (e) {
          return res.status(500).json({ error: e.message });
        }
      });
}); 

router.get('/remove/:id', fetchuser, async(req, res) =>{
    try { 
        const note = await Note.query().findById(req.params.id);
        if (note) removeStored(note.image);
        const noteDeleted = await Note.query().deleteById(req.params.id);
        if(noteDeleted) {
            return res.json({status:true, noteDeleted}); 
        } else {
            return res.json({status:false, noteDeleted}); 
        }
    } catch (e) {
        return res.status(500).json({ status: false, message: e.message })     
    }
}); 

module.exports = router