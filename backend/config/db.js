const mongoose = require('mongoose');

function getMongoUri() {
  const uri = String(process.env.MONGO_URI || '').trim();

  const diagnostics = {
    length: uri.length,
    scheme: uri.split('://')[0] || '',
    startsWithMongo: uri.startsWith('mongodb://'),
    startsWithMongoSrv: uri.startsWith('mongodb+srv://'),
    hasAngleBrackets: /[<>]/.test(uri),
    hasWhitespace: /\s/.test(uri),
    hasQuotes: /^["']|["']$/.test(uri),
    hasAtSymbol: uri.includes('@')
  };

  console.log('[MongoDB URI CHECK]', diagnostics);

  if (!uri) {
    throw new Error('MONGO_URI is missing');
  }

  if (
    !uri.startsWith('mongodb://') &&
    !uri.startsWith('mongodb+srv://')
  ) {
    throw new Error(
      'MONGO_URI must start with mongodb:// or mongodb+srv://'
    );
  }

  if (/[<>]/.test(uri)) {
    throw new Error(
      'MONGO_URI contains < or > placeholder characters'
    );
  }

  if (/\s/.test(uri)) {
    throw new Error(
      'MONGO_URI contains whitespace characters'
    );
  }

  if (/^["']|["']$/.test(uri)) {
    throw new Error(
      'MONGO_URI is wrapped in quotes. Remove the surrounding quotes.'
    );
  }

  return uri;
}

module.exports = async function connectDB() {
  const uri = getMongoUri();

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (error) {
    console.error(
      'MongoDB connection failed:',
      error.message
    );

    throw error;
  }
};
