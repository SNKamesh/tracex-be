import express from "express";

import admin from "firebase-admin";

import { verifyUser } from "../middleware/auth.js";



const router = express.Router();









// CREATE SESSION

router.post(

  "/",

  verifyUser,

  async (req, res) => {


    try {


      const {

        durationSeconds,

        focusScore,

        distractions,

        rank,

        worldId,

        worldName,

        endedAt,


      } = req.body;









      if (!durationSeconds) {


        return res.status(400).json({

          error: "Session duration missing",

        });


      }










      const db = admin.firestore();









      const session = {


        userId: req.user.uid,


        durationSeconds,


        focusScore:

          focusScore ?? 0,


        distractions:

          distractions ?? 0,


        rank:

          rank || "C",



        worldId:

          worldId || null,


        worldName:

          worldName || null,



        endedAt:

          endedAt || Date.now(),



        createdAt:

          admin.firestore.FieldValue.serverTimestamp(),


      };









      const saved =

        await db

          .collection("sessions")

          .add(session);









      res.json({


        success:true,


        id:saved.id,


      });







    } catch (error) {



      console.error(

        "Create session error:",

        error

      );




      res.status(500).json({


        error:

        "Failed to save session",


      });




    }



  }

);











// GET USER SESSIONS

router.get(

  "/",

  verifyUser,

  async (req,res)=>{


    try{


      const db = admin.firestore();





      const snapshot =

        await db

        .collection("sessions")

        .where(

          "userId",

          "==",

          req.user.uid

        )

        .orderBy(

          "createdAt",

          "desc"

        )

        .limit(30)

        .get();








      const sessions =

        snapshot.docs.map(

          doc => ({

            id:doc.id,

            ...doc.data()

          })

        );









      res.json({


        sessions


      });






    }

    catch(error){



      console.error(

        "Fetch sessions error:",

        error

      );



      res.status(500).json({


        error:

        "Failed fetching sessions"


      });



    }


  }

);









export default router;