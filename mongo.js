const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'Cluster0'; // або твоя назва бази

let client;
let db;

async function connectDB() {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB Atlas');
  }
  return db;
}

async function getUsersCollection() {
  const db = await connectDB();
  return db.collection('users');
}

module.exports = { getUsersCollection };
