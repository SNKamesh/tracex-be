import rateLimit from "express-rate-limit";




// GLOBAL API LIMITER

const limiter = rateLimit({

  windowMs:

    15 * 60 * 1000,


  limit:

    200,


  standardHeaders:

    true,


  legacyHeaders:

    false,


  message: {

    success:false,

    error:

      "Too many requests. Please slow down.",

  },

});









// AI SPECIFIC LIMITER

export const aiRateLimiter = rateLimit({


  windowMs:

    60 * 1000,



  limit:

    20,



  standardHeaders:

    true,



  legacyHeaders:

    false,



  message: {


    success:false,


    error:

      "AI request limit reached. Try again soon.",


  },


});









export default limiter;