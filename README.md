# Invoice OCR + Bulk Analysis Dashboard

A complete web application for processing invoices using AI OCR, with comprehensive data analysis, anomaly detection, and interactive dashboards. Built for small businesses in the consulting/freelance industry.

## Features

### Core Functionality
- **Bulk Upload**: Upload single or multiple invoices (PDF, PNG, JPG, JPEG, TIFF, BMP)
- **AWS S3 Storage**: Files are automatically stored in AWS S3 bucket (configurable, falls back to local storage)
- **AI OCR Extraction**: Automatically extracts:
  - Vendor name
  - Invoice number
  - Invoice date
  - Due date
  - Subtotal
  - Tax/GST
  - Total amount
  - Line items (description, quantity, unit price)
- **Data Cleaning & Validation**: Automatically validates and fixes totals, dates, and calculations
- **PostgreSQL Database**: Robust data storage with proper indexing
- **User Authentication**: JWT-based authentication system

### Dashboard & Analytics
- **Spend by Vendor**: Visual breakdown of spending by vendor
- **Spend by Month**: Monthly trends with GST/Tax tracking
- **GST/Tax Totals**: Comprehensive tax tracking
- **Outstanding Invoices**: Track unpaid invoices
- **Top Vendors**: Identify your biggest suppliers
- **Anomaly Detection**: 
  - Detects spending spikes (2+ standard deviations)
  - Identifies unusual vendor spending patterns
  - Statistical analysis of spending trends

### User Interface
- **Modern, Clean UI**: Built with React and Tailwind CSS
- **Interactive Charts**: Line charts, bar charts, and pie charts using Recharts
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Updates**: Dashboard updates automatically after uploads

## Tech Stack

### Backend
- **Flask**: Python web framework
- **PostgreSQL**: Relational database
- **Tesseract OCR**: Open-source OCR engine
- **PyJWT**: JWT authentication
- **bcrypt**: Password hashing
- **psycopg2**: PostgreSQL adapter

### Frontend
- **React**: UI framework
- **React Router**: Client-side routing
- **Recharts**: Chart library
- **Axios**: HTTP client
- **Tailwind CSS**: Utility-first CSS framework

## Prerequisites

- Python 3.8 or higher
- Node.js 16 or higher
- PostgreSQL 12 or higher
- Tesseract OCR

### Installing Tesseract OCR

**macOS:**
```bash
brew install tesseract
brew install poppler  # For PDF processing
```

**Ubuntu/Debian:**
```bash
sudo apt-get install tesseract-ocr
sudo apt-get install poppler-utils
```

**Windows:**
Download and install from: https://github.com/UB-Mannheim/tesseract/wiki

## Installation

### 1. Database Setup

Create a PostgreSQL database:
```bash
createdb invoice_ocr
```

Or using psql:
```sql
CREATE DATABASE invoice_ocr;
```

### 2. Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the backend directory:
```env
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here
DATABASE_URL=postgresql://username:password@localhost/invoice_ocr
```

5. Update `config.py` if needed (or use environment variables)

### 3. Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

## Running the Application

### Start PostgreSQL

Make sure PostgreSQL is running:
```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Start the Backend Server

1. Navigate to the backend directory:
```bash
cd backend
```

2. Activate your virtual environment:
```bash
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Run the Flask server:
```bash
python app.py
```

The backend will start on `http://localhost:5000`

### Start the Frontend Development Server

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Start the React development server:
```bash
npm start
```

The frontend will start on `http://localhost:3000` and automatically open in your browser.

## Usage

### 1. Register/Login

- Navigate to `http://localhost:3000`
- Create a new account or login with existing credentials
- You'll be automatically redirected to the dashboard

### 2. Upload Invoices

- Click on the "Upload" tab
- Select one or multiple invoice files
- Click "Upload Invoices"
- The system will automatically extract data from each invoice
- Review the extraction results and confidence scores

### 3. View Dashboard

- Navigate to the "Dashboard" tab to see:
  - Total spend summary
  - Outstanding invoices
  - Total GST/Tax
  - Top vendors
  - Monthly spending trends
  - Anomaly detection alerts

### 4. Manage Invoices

- Go to the "Invoices" tab to view all uploaded invoices
- Filter by status (All, Paid, Outstanding)
- Edit invoice details by clicking "Edit"
- Delete invoices by clicking "Delete"
- View line items for each invoice

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info

### Invoices
- `POST /api/invoices/upload` - Upload invoice files (requires auth)
- `GET /api/invoices` - Get all invoices (requires auth)
- `GET /api/invoices/<id>` - Get single invoice (requires auth)
- `PUT /api/invoices/<id>` - Update invoice (requires auth)
- `DELETE /api/invoices/<id>` - Delete invoice (requires auth)

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics (requires auth)
- `GET /api/dashboard/anomalies` - Get anomaly detection results (requires auth)

## Project Structure

```
OCR invoice/
├── backend/
│   ├── app.py                 # Flask API server
│   ├── invoice_extractor.py   # OCR and data extraction
│   ├── analytics.py           # Analytics and anomaly detection
│   ├── auth.py                # Authentication utilities
│   ├── database.py            # Database connection and initialization
│   ├── config.py              # Configuration
│   ├── requirements.txt      # Python dependencies
│   └── uploads/               # Uploaded invoice files
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.js   # Dashboard with charts
│   │   │   ├── FileUpload.js  # File upload component
│   │   │   ├── InvoiceList.js  # Invoice list and management
│   │   │   ├── Login.js       # Login component
│   │   │   └── Register.js    # Registration component
│   │   ├── utils/
│   │   │   └── api.js          # API utility with auth
│   │   ├── App.js             # Main app component
│   │   └── index.js           # Entry point
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```

## Data Cleaning & Validation

The system automatically:
- Validates and fixes total calculations (subtotal + tax = total)
- Corrects date formats
- Validates line item totals
- Calculates extraction confidence scores
- Handles missing fields gracefully

## Anomaly Detection

The system detects:
- **Spending Spikes**: Monthly spending that exceeds 2 standard deviations from the mean
- **Unusual Vendor Spending**: Recent invoices from a vendor that are 3x their average

## Serverless Upload Option (API Gateway + Lambda)

If you prefer to keep AWS credentials out of the application entirely, deploy the
`lambda/` package and follow `API_GATEWAY_SETUP.md`. This provisions:
- An API Gateway endpoint that accepts uploads
- A Lambda function that writes directly to S3 using its IAM role
- A second Lambda that processes newly created S3 objects

## Limitations & Notes

- OCR accuracy depends on invoice quality and format
- Some fields may require manual correction after extraction
- The application is designed for MVP use and can handle 50-100 invoices per batch
- For production use, consider:
  - Adding email notifications
  - Implementing better OCR models or services (Google Vision API, AWS Textract)
  - Adding export functionality (CSV, PDF reports)
  - Implementing file cleanup and storage management
  - Adding multi-tenant support
  - Implementing rate limiting
  - Using IAM roles instead of access keys for AWS deployments

## Troubleshooting

**Database connection errors:**
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env file
- Verify database credentials

**OCR not working:**
- Ensure Tesseract OCR is installed and accessible in your PATH
- Check that invoice images are clear and readable
- For Windows, uncomment and set the Tesseract path in `invoice_extractor.py`

**PDF processing errors:**
- Install poppler utilities for PDF to image conversion
- Ensure PDF files are not password-protected

**Port already in use:**
- Change the port in `backend/app.py` (Flask) or `frontend/package.json` (React)

## License

This is an MVP project for demonstration purposes.
