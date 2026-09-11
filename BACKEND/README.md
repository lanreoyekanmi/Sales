# Backend API

A Node.js backend service using Express and MongoDB for data persistence.

## Features

- RESTful API endpoints
- MongoDB database integration
- Authentication & authorization
- Error handling and validation
- Environment configuration

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas connection string)
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```
   MONGODB_URI=mongodb://localhost:27017/database_name
   PORT=5000
   NODE_ENV=development
   ```

## Running the Server

Start the development server:
```bash
npm start
```

Or with nodemon for auto-reload:
```bash
npm run dev
```

## API Documentation

API endpoints are available at `http://localhost:5000/api`

## Technologies

- **Express.js** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling

## Project Structure

```
├── src/
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   └── app.js
├── .env
└── package.json
```

## License

MIT
