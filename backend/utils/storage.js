const fs = require('fs');
const path = require('path');
const config = require('../config');

// Files live in config.tmpDir: %APPDATA%/India Gate POS/files in the installed app (served at
// /images). Before, they went into the program folder (backend/tmp), which isn't writable under
// Program Files and is inside app.asar, so Z-report PDF copies could not be saved.

const storage = {
  /**
   * Save a file to the specified path
   * @param {string} filePath - The relative path to save the file (e.g., "reports/file.pdf")
   * @param {Buffer|string} content - The file content (Buffer for binary files, string for text)
   * @returns {Promise<void>}
   */
  async put(filePath, content) {
    try {
      const fullPath = path.join(config.tmpDir, filePath);
      // Ensure the directory exists
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      // Write the file
      await fs.promises.writeFile(fullPath, content);
    } catch (err) {
      console.error('Error saving file:', err);
      throw new Error('Failed to save file');
    }
  },

  /**
   * Read a file from the specified path
   * @param {string} filePath - The relative path to the file (e.g., "reports/file.pdf")
   * @returns {Promise<Buffer>} - Returns the file content as a Buffer
   */
  async get(filePath) {
    try {
      const fullPath = path.join(config.tmpDir, filePath);
      return await fs.promises.readFile(fullPath);
    } catch (err) {
      console.error('Error reading file:', err);
      throw new Error('Failed to read file');
    }
  },

  /**
   * Delete a file from the specified path
   * @param {string} filePath - The relative path to the file (e.g., "reports/file.pdf")
   * @returns {Promise<void>}
   */
  async delete(filePath) {
    try {
      const fullPath = path.join(config.tmpDir, filePath);

      // Check if the file exists before attempting to delete
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      } else {
        console.warn('File not found:', fullPath);
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      throw new Error('Failed to delete file');
    }
  },

  /**
   * Check if a file exists at the specified path
   * @param {string} filePath - The relative path to the file (e.g., "reports/file.pdf")
   * @returns {Promise<boolean>} - Returns true if the file exists, false otherwise
   */
  async exists(filePath) {
    try {
      const fullPath = path.join(config.tmpDir, filePath);
      return fs.existsSync(fullPath);
    } catch (err) {
      console.error('Error checking file existence:', err);
      throw new Error('Failed to check file existence');
    }
  }
};

module.exports = storage;