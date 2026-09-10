const multer = require('multer');
const path = require('path');


const storage =
  multer.diskStorage({

    destination:
      function(req,file,cb){

        cb(
          null,
          'uploads/'
        );

      },


    filename:
      function(req,file,cb){

        const ext =
          path.extname(
            file.originalname
          );


        cb(
          null,
          Date.now() + ext
        );

      }

  });



const upload =
  multer({

    storage,

    limits:{
      fileSize:
        5 * 1024 * 1024
    },


    fileFilter:
      function(req,file,cb){

        const allowed =
          [
            'image/jpeg',
            'image/png',
            'image/jpg'
          ];


        if(
          allowed.includes(
            file.mimetype
          )
        ){

          cb(null,true);

        }

        else {

          cb(
            new Error(
              'Only image files are allowed'
            )
          );

        }

      }

  });



module.exports =
  upload;