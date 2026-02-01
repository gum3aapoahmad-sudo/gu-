
import { GoogleGenAI } from "@google/genai";
import { EditingMode } from "../types";

export const processImage = async (
  base64Image: string,
  prompt: string,
  mode: EditingMode = EditingMode.STANDARD
): Promise<string> => {
  // Use the API key directly from environment variables.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: mode,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: 'image/png'
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: mode === EditingMode.PROFESSIONAL ? {
        imageConfig: {
          aspectRatio: "3:4", // Standard professional vertical portrait/print ratio
          imageSize: "1K"
        }
      } : undefined
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No response from AI model");

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data found in AI response");
  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    if (error.message?.includes("Requested entity was not found") || error.status === 404) {
      throw new Error("AUTH_REQUIRED");
    }
    throw error;
  }
};
