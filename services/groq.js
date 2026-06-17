import dotenv from "dotenv";
import Groq from "groq-sdk";


dotenv.config();


if (!process.env.GROQ_API_KEY) {
  throw new Error(
    "Missing GROQ_API_KEY in .env"
  );
}


const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


export async function generateGroqResponse(
  prompt,
  history = []
) {
  try {

    const messages = [
      ...history,
      {
        role: "user",
        content: prompt,
      },
    ];


    const completion =
      await groq.chat.completions.create({

        messages,

        model:
          "llama-3.1-8b-instant",

        temperature:0.7,

      });


    return (
      completion
        .choices?.[0]
        ?.message
        ?.content || ""
    );


  } catch (error) {

    console.error(
      "Groq API Error:",
      error
    );


    throw new Error(
      "Failed to generate response from Groq"
    );

  }
}