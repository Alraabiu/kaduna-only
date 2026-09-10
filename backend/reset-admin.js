
const dns = require('dns');

dns.setServers([
  '8.8.8.8',
  '1.1.1.1'
]);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const User = require('./models/User');
const Wallet = require('./models/Wallet');

(async () => {

  try {

    console.log('Resolving MongoDB Atlas...');

    const records =
      await dns.promises.resolveSrv(
        '_mongodb._tcp.cluster0.sw6wfci.mongodb.net'
      );

    console.log(
      'MongoDB SRV resolved:',
      records.map(
        record =>
          `${record.name}:${record.port}`
      )
    );

    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      'MongoDB connected'
    );


    const email =
      'kadunaonly@gmail.com';

    const phone =
      '08056480413';

    const password =
      'Muh@mmad';

    const fullName =
      'Kaduna Only Admin';


    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );


    /*
    =======================================================
    FIND EXISTING ADMIN
    =======================================================
    */

    let admin =
      await User.findOne({
        role: 'admin'
      });


    /*
    -------------------------------------------------------
    If no admin exists, look for the requested email/phone.
    -------------------------------------------------------
    */

    if (!admin) {

      admin =
        await User.findOne({
          $or: [
            {
              email
            },
            {
              phone
            }
          ]
        });

    }


    /*
    =======================================================
    UPDATE EXISTING ADMIN
    =======================================================
    */

    if (admin) {

      admin.fullName =
        fullName;

      admin.email =
        email;

      admin.phone =
        phone;

      admin.passwordHash =
        passwordHash;

      admin.role =
        'admin';

      admin.status =
        'active';

      await admin.save();

      console.log(
        'Existing admin account updated'
      );

    }


    /*
    =======================================================
    CREATE ADMIN IF NONE EXISTS
    =======================================================
    */

    else {

      admin =
        await User.create({
          fullName,
          email,
          phone,
          passwordHash,
          role: 'admin',
          status: 'active'
        });

      console.log(
        'New admin account created'
      );

    }


    /*
    =======================================================
    WALLET
    =======================================================
    */

    const wallet =
      await Wallet.findOne({
        user: admin._id
      });


    if (!wallet) {

      await Wallet.create({
        user: admin._id
      });

      console.log(
        'Admin wallet created'
      );

    }


    /*
    =======================================================
    RESULT
    =======================================================
    */

    console.log('');

    console.log(
      '===================================='
    );

    console.log(
      'ADMIN ACCOUNT READY'
    );

    console.log(
      '===================================='
    );

    console.log(
      'Name:   ' +
      admin.fullName
    );

    console.log(
      'Email:  ' +
      admin.email
    );

    console.log(
      'Phone:  ' +
      admin.phone
    );

    console.log(
      'Role:   ' +
      admin.role
    );

    console.log(
      'Status: ' +
      admin.status
    );

    console.log(
      '===================================='
    );


    await mongoose.disconnect();

    console.log(
      'MongoDB disconnected'
    );

  }

  catch (error) {

    console.error('');

    console.error(
      'ADMIN RESET FAILED'
    );

    console.error(
      error.message
    );


    try {

      await mongoose.disconnect();

    }

    catch (_) {}


    process.exit(1);

  }

})();