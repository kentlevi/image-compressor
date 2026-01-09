# Image Compressor

## Overview
- The Image Compressor is a client-side web application that reduces image file sizes while preserving visual quality
- Supports batch compression, folder uploads, drag-and-drop input, and ZIP downloads
- All operations are performed locally within the browser

## Features
- Compress images based on target size reduction percentage
- Batch compression for multiple files or folders
- Drag-and-drop image input
- Adjustable reduction percentage
- Iterative quality adjustment to reach target size
- Optional inclusion of original images
- ZIP archive output for batch downloads
- Folder structure preserved in ZIP output
- Automatic cancellation of previous compression sessions
- Memory-safe processing with cleanup
- No external backend or API required

## Supported Browsers
- Google Chrome (recommended)
- Microsoft Edge
- Firefox
- Safari

## File Structure
- `index.html`
- `styles.css`
- `script.js`
- `README.md`

## Usage
1. Open `index.html` in a modern web browser
2. Select images using one of the following methods:
   - Select Folder
   - Select Files
   - Drag and drop images into the drop zone
3. Adjust the reduction percentage slider
4. Enable or disable optional settings:
   - Include Originals
   - ZIP Output
5. Click **Download** to retrieve the compressed images

## Processing Notes
- Compression is performed using canvas-based encoding
- Quality is gradually reduced until the target size is reached
- Processing is incremental to prevent UI freezing
- Changing settings cancels any ongoing compression process
