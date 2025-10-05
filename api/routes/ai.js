import express from 'express';
import { body, validationResult } from 'express-validator';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { documentProcessor } from '../services/simpleDocumentProcessor.js';
import { authenticateUser, userRateLimit } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../middleware/errorHandler.js';
import { sanitizeUnicode } from '../utils/unicodeSanitizer.js';

// Ensure environment variables are loaded
dotenv.config();

const router = express.Router();

// Initialize AI clients (server-side only)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // No dangerouslyAllowBrowser - this is server-side!
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // No dangerouslyAllowBrowser - this is server-side!
});

// Input validation middleware
const validateChatRequest = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message must be between 1 and 5000 characters')
    .escape(),
  body('twinId')
    .isUUID()
    .withMessage('Invalid twin ID format'),
  body('conversationId')
    .optional()
    .isUUID()
    .withMessage('Invalid conversation ID format'),
  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object'),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, 'VALIDATION_ERROR', 'Input validation failed', 400, errors.array());
  }
  next();
};

// Utility function to build system prompt (moved from frontend)
function buildSystemPrompt(context) {
  const { twin, studentProfile, professorContext } = context;

  let systemPrompt = `You are a digital twin of ${professorContext?.full_name || twin.name}, `;

  if (professorContext?.university) {
    systemPrompt += `a professor at ${professorContext.university}`;
    if (professorContext.department) {
      systemPrompt += ` in the ${professorContext.department} department`;
    }
  }
  systemPrompt += `. `;

  if (twin.subject_area) {
    systemPrompt += `You specialize in ${twin.subject_area}. `;
  }

  if (twin.description) {
    systemPrompt += `${twin.description} `;
  }

  // Add personality traits
  if (twin.personality_traits && Object.keys(twin.personality_traits).length > 0) {
    const traits = twin.personality_traits;
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
    const teachingStyle = twin.teaching_style;
    systemPrompt += `Your teaching approach: `;

    if (teachingStyle.primary_method) {
      const methodMap = {
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

  // Vicente Leon specific traits
  if (twin.name.toLowerCase().includes('vicente') || twin.name.toLowerCase().includes('leon')) {
    systemPrompt += `
You are specifically modeled after Professor Vicente M. León from Universidad del Pacífico in Lima, Peru. You are known for:

**Your Core Teaching Mantras:**
- "Connect the dots" - You frequently encourage students to link concepts across disciplines and time periods
- "Uncertainty is the enemy of markets" - A hallmark saying you use when discussing market dynamics
- You often emphasize the importance of understanding geopolitics and current events for finance

**Your Communication Style:**
- You speak with intellectual rigor but remain approachable and warm
- You use rhetorical questions to engage students ("What happens if our assumptions are wrong?")
- You incorporate gentle humor and real-world examples
- You often reference current events and global markets
- You might say things like "Let me put it this way..." or "The key insight here is..."

**Your Teaching Philosophy:**
- Finance is deeply connected to geopolitics, history, and human behavior
- You bridge global best practices with local Latin American context
- You emphasize ethical decision-making and long-term thinking
- You value continuous learning and intellectual curiosity
- You believe in questioning assumptions and maintaining humility

**Your Background:**
- Former banker with 20+ years experience before academia
- History degree from Georgetown, MBA from Columbia
- Worked at ING Barings and HSBC in structured finance and debt capital markets
- Research focus on institutional finance and philanthropy in Latin America
- You bring practical banking experience into theoretical discussions`;
  }

  // Student-specific adaptations
  if (studentProfile && studentProfile.learning_style) {
    const learningStyle = studentProfile.learning_style;
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
- Keep responses concise but thorough (aim for 2-3 paragraphs maximum)
- Use your characteristic phrases and teaching style naturally
- If the student seems confused, adjust your explanation approach
- Always maintain an educational focus
- Connect concepts to real-world applications when possible
- Encourage critical thinking and questioning`;

  return systemPrompt;
}

function buildSystemPromptWithRAG(context, relevantContext) {
  // Start with the base system prompt
  let systemPrompt = buildSystemPrompt(context);

  // Add RAG context if available
  if (relevantContext && relevantContext.contexts.length > 0) {
    systemPrompt += `\n\n**RELEVANT COURSE MATERIALS AND CONTEXT:**

You have access to the following relevant information from uploaded course materials and documents:

`;

    // Add each context chunk with source information
    relevantContext.contexts.forEach((contextChunk, index) => {
      const source = relevantContext.sources[index];
      systemPrompt += `**Source: ${source.fileName} (Section ${source.chunkIndex + 1})**\n`;
      systemPrompt += `${contextChunk}\n\n`;
    });

    systemPrompt += `**IMPORTANT INSTRUCTIONS FOR USING THIS CONTEXT:**
- Use the provided course materials to give more accurate and detailed answers
- When referencing information from the materials, mention the source (e.g., "According to the uploaded lecture notes..." or "As covered in the course materials...")
- If the user asks about something covered in the materials, prioritize that information over general knowledge
- If there's a conflict between the uploaded materials and general knowledge, defer to the course materials and explain the difference
- Feel free to elaborate on concepts from the materials with your general teaching knowledge
- If the materials don't contain relevant information for the question, proceed with your general knowledge but mention this

Remember: You are still the same professor with your personality and teaching style, but now you have access to your actual course materials to provide more accurate and specific guidance.`;
  }

  return systemPrompt;
}

function formatConversationHistory(messages) {
  const recentMessages = messages.slice(-10);
  return recentMessages.map(message => ({
    role: message.is_user_message ? 'user' : 'assistant',
    content: sanitizeUnicode(message.content || '')
  }));
}

// POST /api/ai/chat - Generate AI response with RAG context (Requires authentication)
router.post('/chat', authenticateUser, userRateLimit(30, 15 * 60 * 1000), validateChatRequest, handleValidationErrors, async (req, res) => {
  try {
    const { message, context } = req.body;

    // Validate required context
    if (!context || !context.twin) {
      return errorResponse(res, 'MISSING_CONTEXT', 'Twin data is required in request context', 400);
    }

    // Sanitize user message to prevent Unicode errors
    const sanitizedMessage = sanitizeUnicode(message || '');

    // Search for relevant context from uploaded documents
    let relevantContext = null;
    try {
      const twinId = context.twin.id || req.body.twinId;
      if (twinId) {
        relevantContext = await documentProcessor.searchRelevantContext(twinId, sanitizedMessage, 3);
      }
    } catch (ragError) {
      console.warn('RAG context search failed:', ragError);
      // Continue without RAG context rather than failing the entire request
    }

    // Build enhanced system prompt with RAG context (already sanitized in build functions)
    const systemPrompt = sanitizeUnicode(buildSystemPromptWithRAG(context, relevantContext));

    // Format conversation history (already sanitized in formatConversationHistory)
    const conversationMessages = context.conversationHistory
      ? formatConversationHistory(context.conversationHistory)
      : [];

    // Call Claude API with enhanced context
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        ...conversationMessages,
        { role: 'user', content: sanitizedMessage }
      ]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return successResponse(res, {
        response: content.text,
        usage: response.usage,
        ragContext: relevantContext ? {
          foundRelevantContent: relevantContext.contexts.length > 0,
          sourcesUsed: relevantContext.sources.length,
          sources: relevantContext.sources
        } : null
      }, 'AI response generated successfully');
    } else {
      throw new Error('Unexpected response format from Claude API');
    }

  } catch (error) {
    console.error('Claude API Error:', error);

    // Handle specific error types
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        error: 'AI service configuration error'
      });
    }

    res.status(500).json({
      error: 'Failed to generate AI response',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/ai/follow-up-questions - Generate follow-up questions (Requires authentication)
router.post('/follow-up-questions', authenticateUser, userRateLimit(50, 15 * 60 * 1000), validateChatRequest, handleValidationErrors, async (req, res) => {
  try {
    const { context } = req.body;

    if (!context || !context.conversationHistory || context.conversationHistory.length === 0) {
      return res.status(400).json({
        error: 'Conversation history is required to generate follow-up questions'
      });
    }

    const systemPrompt = `Based on the conversation history, suggest 3 relevant follow-up questions that would help the student deepen their understanding of the topic. Return as a JSON array of strings.`;
    const conversationMessages = formatConversationHistory(context.conversationHistory);

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      temperature: 0.5,
      system: systemPrompt,
      messages: conversationMessages
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        const questions = JSON.parse(content.text);
        res.json({
          questions: Array.isArray(questions) ? questions.slice(0, 3) : [],
          timestamp: new Date().toISOString()
        });
      } catch (parseError) {
        res.json({
          questions: [],
          timestamp: new Date().toISOString()
        });
      }
    } else {
      throw new Error('Unexpected response format from Claude API');
    }

  } catch (error) {
    console.error('Follow-up questions error:', error);
    res.status(500).json({
      error: 'Failed to generate follow-up questions',
      questions: []
    });
  }
});

// POST /api/ai/assess-understanding - Assess student understanding (Requires authentication)
router.post('/assess-understanding', authenticateUser, userRateLimit(20, 15 * 60 * 1000), [
  body('studentResponse')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Student response must be between 1 and 2000 characters')
    .escape(),
  body('topic')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Topic must be between 1 and 200 characters')
    .escape(),
], handleValidationErrors, async (req, res) => {
  try {
    const { studentResponse, topic } = req.body;

    const systemPrompt = sanitizeUnicode(`Analyze the student's response about "${topic}" and assess their understanding level. Return a JSON object with:
    {
      "understanding_level": "low" | "medium" | "high",
      "areas_of_confusion": ["list of specific areas where student seems confused"],
      "suggestions": ["specific suggestions for helping the student improve understanding"]
    }`);

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 400,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: sanitizeUnicode(studentResponse) }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        const assessment = JSON.parse(content.text);
        res.json({
          assessment,
          timestamp: new Date().toISOString()
        });
      } catch (parseError) {
        res.json({
          assessment: { understanding_level: 'medium' },
          timestamp: new Date().toISOString()
        });
      }
    } else {
      throw new Error('Unexpected response format from Claude API');
    }

  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({
      error: 'Failed to assess understanding',
      assessment: { understanding_level: 'medium' }
    });
  }
});

// POST /api/ai/openai-chat - Generate AI response using OpenAI (Requires authentication)
router.post('/openai-chat', authenticateUser, userRateLimit(30, 15 * 60 * 1000), validateChatRequest, handleValidationErrors, async (req, res) => {
  try {
    const { message, context } = req.body;

    // Validate required context
    if (!context || !context.twin) {
      return errorResponse(res, 'MISSING_CONTEXT', 'Twin data is required in request context', 400);
    }

    // Build system prompt (reusing the same function)
    const systemPrompt = buildSystemPrompt(context);

    // Format conversation history
    const conversationMessages = context.conversationHistory
      ? formatConversationHistory(context.conversationHistory)
      : [];

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationMessages,
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      return successResponse(res, {
        response: content,
        usage: response.usage,
        model: 'gpt-4'
      }, 'AI response generated successfully');
    } else {
      throw new Error('No content in OpenAI response');
    }

  } catch (error) {
    console.error('OpenAI API Error:', error);

    // Handle specific error types
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        error: 'AI service configuration error'
      });
    }

    res.status(500).json({
      error: 'Failed to generate AI response',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// POST /api/ai/openai-follow-up-questions - Generate follow-up questions using OpenAI
router.post('/openai-follow-up-questions', authenticateUser, userRateLimit(50, 15 * 60 * 1000), validateChatRequest, handleValidationErrors, async (req, res) => {
  try {
    const { context } = req.body;

    if (!context || !context.conversationHistory || context.conversationHistory.length === 0) {
      return res.status(400).json({
        error: 'Conversation history is required to generate follow-up questions'
      });
    }

    const systemPrompt = `Based on the conversation history, suggest 3 relevant follow-up questions that would help the student deepen their understanding of the topic. Return as a JSON array of strings.`;
    const conversationMessages = formatConversationHistory(context.conversationHistory);

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationMessages
      ],
      temperature: 0.5,
      max_tokens: 200
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        const questions = JSON.parse(content);
        res.json({
          questions: Array.isArray(questions) ? questions.slice(0, 3) : [],
          timestamp: new Date().toISOString()
        });
      } catch (parseError) {
        res.json({
          questions: [],
          timestamp: new Date().toISOString()
        });
      }
    } else {
      throw new Error('No content in OpenAI response');
    }

  } catch (error) {
    console.error('OpenAI follow-up questions error:', error);
    res.status(500).json({
      error: 'Failed to generate follow-up questions',
      questions: []
    });
  }
});

// POST /api/ai/openai-assess-understanding - Assess student understanding using OpenAI
router.post('/openai-assess-understanding', authenticateUser, userRateLimit(20, 15 * 60 * 1000), [
  body('studentResponse')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Student response must be between 1 and 2000 characters')
    .escape(),
  body('topic')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Topic must be between 1 and 200 characters')
    .escape(),
], handleValidationErrors, async (req, res) => {
  try {
    const { studentResponse, topic } = req.body;

    const systemPrompt = `Analyze the student's response about "${topic}" and assess their understanding level. Return a JSON object with:
    {
      "understanding_level": "low" | "medium" | "high",
      "areas_of_confusion": ["list of specific areas where student seems confused"],
      "suggestions": ["specific suggestions for helping the student improve understanding"]
    }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: studentResponse }
      ],
      temperature: 0.3,
      max_tokens: 300
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      try {
        const assessment = JSON.parse(content);
        res.json({
          assessment,
          timestamp: new Date().toISOString()
        });
      } catch (parseError) {
        res.json({
          assessment: { understanding_level: 'medium' },
          timestamp: new Date().toISOString()
        });
      }
    } else {
      throw new Error('No content in OpenAI response');
    }

  } catch (error) {
    console.error('OpenAI assessment error:', error);
    res.status(500).json({
      error: 'Failed to assess understanding',
      assessment: { understanding_level: 'medium' }
    });
  }
});

export default router;