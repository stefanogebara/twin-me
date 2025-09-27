// DEPRECATED: This file is deprecated in favor of secure server-side API calls
// Use secureApi from '@/lib/secureApi' instead
import { secureApi } from '@/lib/secureApi';
import type { DigitalTwin, Message, StudentProfile } from '@/types/database';

// Legacy warning
console.warn('WARNING: Using deprecated OpenAI client. Please migrate to secureApi.');

interface ChatContext {
  twin: DigitalTwin;
  studentProfile?: StudentProfile;
  conversationHistory: Message[];
  professorContext?: {
    full_name: string;
    university?: string;
    department?: string;
  };
}

export class DigitalTwinLLM {
  static async generateResponse(
    userMessage: string,
    context: ChatContext
  ): Promise<string> {
    try {
      // Use secure server-side API instead of exposed client-side API
      return await secureApi.generateOpenAIResponse(userMessage, context);
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to generate response. Please check your connection and try again.');
    }
  }

  private static buildSystemPrompt(context: ChatContext): string {
    const { twin, studentProfile, professorContext } = context;

    // Base persona from twin data
    let systemPrompt = `You are a digital twin of ${professorContext?.full_name || twin.name}, `;

    if (professorContext?.university) {
      systemPrompt += `a professor at ${professorContext.university}`;
      if (professorContext.department) {
        systemPrompt += ` in the ${professorContext.department} department`;
      }
    }
    systemPrompt += `. `;

    // Add subject expertise
    if (twin.subject_area) {
      systemPrompt += `You specialize in ${twin.subject_area}. `;
    }

    // Add description and personality
    if (twin.description) {
      systemPrompt += `${twin.description} `;
    }

    // Add personality traits
    if (twin.personality_traits && Object.keys(twin.personality_traits).length > 0) {
      const traits = twin.personality_traits as any;
      systemPrompt += `Your personality traits include: `;

      if (traits.communication_style) {
        systemPrompt += `you communicate in a ${traits.communication_style} manner, `;
      }
      if (traits.energy_level) {
        systemPrompt += `your energy level is ${traits.energy_level}, `;
      }
      if (traits.sense_of_humor && traits.sense_of_humor !== 'none') {
        systemPrompt += `you have a ${traits.sense_of_humor} sense of humor, `;
      }
      if (traits.supportiveness) {
        systemPrompt += `you are ${traits.supportiveness}ly supportive. `;
      }
    }

    // Add teaching style
    if (twin.teaching_style && Object.keys(twin.teaching_style).length > 0) {
      const teachingStyle = twin.teaching_style as any;
      systemPrompt += `Your teaching approach: `;

      if (teachingStyle.primary_method) {
        const methodMap: {[key: string]: string} = {
          'socratic': 'You prefer the Socratic method, asking guiding questions to help students discover answers',
          'direct_instruction': 'You use direct instruction, clearly explaining concepts step by step',
          'project_based': 'You favor project-based learning, using real-world applications',
          'flipped_classroom': 'You use a flipped classroom approach, encouraging exploration and discussion'
        };
        systemPrompt += `${methodMap[teachingStyle.primary_method] || teachingStyle.primary_method}. `;
      }

      if (teachingStyle.encourages_questions) {
        systemPrompt += `You actively encourage students to ask questions. `;
      }
      if (teachingStyle.uses_humor) {
        systemPrompt += `You incorporate appropriate humor into your teaching. `;
      }
      if (teachingStyle.provides_examples) {
        systemPrompt += `You frequently provide concrete examples to illustrate concepts. `;
      }
      if (teachingStyle.checks_understanding) {
        systemPrompt += `You regularly check if students understand before moving on. `;
      }
    }

    // Add common phrases
    if (twin.common_phrases && twin.common_phrases.length > 0) {
      systemPrompt += `You often use phrases like: "${twin.common_phrases.join('", "')}" `;
    }

    // Add favorite analogies
    if (twin.favorite_analogies && twin.favorite_analogies.length > 0) {
      systemPrompt += `When explaining concepts, you like to use analogies such as: ${twin.favorite_analogies.join(', ')}. `;
    }

    // Student-specific adaptations
    if (studentProfile && studentProfile.learning_style) {
      const learningStyle = studentProfile.learning_style as any;
      systemPrompt += `\n\nAdapt your responses to this student's learning preferences: `;

      if (learningStyle.visual_preference > 3) {
        systemPrompt += `They prefer visual explanations with diagrams and examples. `;
      }
      if (learningStyle.auditory_preference > 3) {
        systemPrompt += `They learn well through spoken explanations and discussions. `;
      }
      if (learningStyle.reading_preference > 3) {
        systemPrompt += `They prefer text-based learning and written materials. `;
      }
      if (learningStyle.preferred_pace === 'slow') {
        systemPrompt += `Take your time and break down concepts into smaller steps. `;
      } else if (learningStyle.preferred_pace === 'fast') {
        systemPrompt += `You can move through concepts more quickly with this student. `;
      }
    }

    systemPrompt += `\n\nImportant guidelines:
- Stay in character as the professor throughout the conversation
- Be helpful, educational, and encouraging
- If asked about topics outside your expertise, acknowledge the limitation but try to provide general guidance
- Keep responses concise but thorough
- Use your characteristic phrases and teaching style naturally
- If the student seems confused, adjust your explanation approach
- Always maintain an educational focus`;

    return systemPrompt;
  }

  private static formatConversationHistory(messages: Message[]): Array<{role: 'user' | 'assistant', content: string}> {
    // Take the last 10 messages to maintain context while staying within token limits
    const recentMessages = messages.slice(-10);

    return recentMessages.map(message => ({
      role: message.is_user_message ? 'user' as const : 'assistant' as const,
      content: message.content
    }));
  }

  // Method to generate follow-up questions based on the conversation
  static async generateFollowUpQuestions(context: ChatContext): Promise<string[]> {
    try {
      // Use secure server-side API
      return await secureApi.generateOpenAIFollowUpQuestions(context);
    } catch (error) {
      console.error('Error generating follow-up questions:', error);
      return [];
    }
  }

  // Method to assess student understanding based on their responses
  static async assessStudentUnderstanding(
    studentResponse: string,
    topic: string
  ): Promise<{
    understanding_level: 'low' | 'medium' | 'high';
    areas_of_confusion?: string[];
    suggestions?: string[];
  }> {
    try {
      // Use secure server-side API
      return await secureApi.assessStudentUnderstandingOpenAI(studentResponse, topic);
    } catch (error) {
      console.error('Error assessing student understanding:', error);
      return { understanding_level: 'medium' };
    }
  }
}