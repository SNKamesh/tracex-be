import admin from "firebase-admin";



export async function verifyUser(req, res, next) {

  try {


    const header = req.headers.authorization;



    if (!header || !header.startsWith("Bearer ")) {

      return res.status(401).json({

        error: "Authentication required",

      });

    }





    const token = header.split(" ")[1];





    const decoded =

      await admin.auth().verifyIdToken(token);





    req.user = {

      uid: decoded.uid,

      email: decoded.email,

    };





    next();



  } catch (error) {


    console.error(

      "Auth middleware error:",

      error

    );



    return res.status(401).json({

      error: "Invalid session",

    });


  }

}