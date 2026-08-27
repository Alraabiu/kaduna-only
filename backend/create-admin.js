require('dotenv').config();
console.log(
  "CREATE ADMIN FILE VERSION: returnDocument FIXED"
);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

(async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

    const admin = await User.findOneAndUpdate(
      { phone: '08000000001' },
      {
        $set: {
          fullName: 'Kaduna Only Admin',
          email: 'admin@kadunaonly.local',
          passwordHash,
          role: 'admin',
          status: 'active'
        }
      },
      {
  returnDocument:'after'
}
    );

    console.log('');
    console.log('================================');
    console.log('ADMIN ACCOUNT READY');
    console.log('================================');
    console.log('ID:', admin._id.toString());
    console.log('Phone: 08000000001');
    console.log('Role:', admin.role);
    console.log('Status:', admin.status);
    console.log('================================');

    await mongoose.disconnect();
  } catch (error) {
    console.error('ADMIN SETUP FAILED:', error);
    process.exit(1);
  }
})();
