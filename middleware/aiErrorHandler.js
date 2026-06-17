export default function aiErrorHandler(
  err,
  req,
  res,
  next
) {

  console.error(
    "TraceX Backend Error:",
    err
  );



  res.status(
    err.status || 500
  ).json({

    success:false,

    error:
      err.message ||
      "Internal server error",

  });

}