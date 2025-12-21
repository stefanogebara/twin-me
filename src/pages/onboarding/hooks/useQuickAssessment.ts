import { useState, useCallback } from 'react';

export interface QuestionOption {
  id: string;
  text: string;
  trait: 'O' | 'C' | 'E' | 'A' | 'N';
  weight: number; // 0-100, how strongly this indicates the trait
}

export interface Question {
  id: string;
  text: string;
  category: string;
  options: QuestionOption[];
}

// 10 carefully crafted questions for quick personality assessment
export const QUICK_ASSESSMENT_QUESTIONS: Question[] = [
  {
    id: 'q1',
    text: 'When you have unexpected free time, you\'re most likely to...',
    category: 'Energy Source',
    options: [
      { id: 'q1a', text: 'Start a new creative project or hobby', trait: 'O', weight: 85 },
      { id: 'q1b', text: 'Catch up with friends or make plans', trait: 'E', weight: 80 },
      { id: 'q1c', text: 'Relax with familiar entertainment', trait: 'N', weight: 35 },
      { id: 'q1d', text: 'Organize or plan for the week ahead', trait: 'C', weight: 75 }
    ]
  },
  {
    id: 'q2',
    text: 'In group projects, you naturally tend to...',
    category: 'Collaboration Style',
    options: [
      { id: 'q2a', text: 'Take the lead and delegate tasks', trait: 'E', weight: 85 },
      { id: 'q2b', text: 'Focus on keeping everyone happy', trait: 'A', weight: 80 },
      { id: 'q2c', text: 'Contribute creative ideas and solutions', trait: 'O', weight: 75 },
      { id: 'q2d', text: 'Track deadlines and ensure quality', trait: 'C', weight: 80 }
    ]
  },
  {
    id: 'q3',
    text: 'When facing a stressful situation, you typically...',
    category: 'Stress Response',
    options: [
      { id: 'q3a', text: 'Feel anxious but push through', trait: 'N', weight: 70 },
      { id: 'q3b', text: 'Stay calm and create an action plan', trait: 'C', weight: 80 },
      { id: 'q3c', text: 'Talk it through with others', trait: 'E', weight: 70 },
      { id: 'q3d', text: 'Find a creative outlet or distraction', trait: 'O', weight: 65 }
    ]
  },
  {
    id: 'q4',
    text: 'Your ideal weekend involves...',
    category: 'Leisure Preference',
    options: [
      { id: 'q4a', text: 'Exploring somewhere new or trying something different', trait: 'O', weight: 85 },
      { id: 'q4b', text: 'A social gathering with friends or family', trait: 'E', weight: 85 },
      { id: 'q4c', text: 'Quiet time at home to recharge', trait: 'N', weight: 30 },
      { id: 'q4d', text: 'Productive activities and personal projects', trait: 'C', weight: 75 }
    ]
  },
  {
    id: 'q5',
    text: 'When someone disagrees with you, you...',
    category: 'Conflict Style',
    options: [
      { id: 'q5a', text: 'Debate passionately for your viewpoint', trait: 'E', weight: 70 },
      { id: 'q5b', text: 'Try to understand their perspective', trait: 'A', weight: 85 },
      { id: 'q5c', text: 'Feel uncomfortable and may back down', trait: 'N', weight: 60 },
      { id: 'q5d', text: 'Look for a logical compromise', trait: 'C', weight: 70 }
    ]
  },
  {
    id: 'q6',
    text: 'Your music library would best be described as...',
    category: 'Taste Profile',
    options: [
      { id: 'q6a', text: 'Eclectic - always exploring new genres', trait: 'O', weight: 90 },
      { id: 'q6b', text: 'Mood-driven - matching feelings to songs', trait: 'N', weight: 55 },
      { id: 'q6c', text: 'Social - popular hits everyone knows', trait: 'E', weight: 70 },
      { id: 'q6d', text: 'Curated - carefully organized playlists', trait: 'C', weight: 75 }
    ]
  },
  {
    id: 'q7',
    text: 'When making important decisions, you rely most on...',
    category: 'Decision Making',
    options: [
      { id: 'q7a', text: 'Gut feeling and intuition', trait: 'O', weight: 75 },
      { id: 'q7b', text: 'Research and careful analysis', trait: 'C', weight: 85 },
      { id: 'q7c', text: 'Advice from trusted people', trait: 'A', weight: 75 },
      { id: 'q7d', text: 'How it affects others around you', trait: 'A', weight: 80 }
    ]
  },
  {
    id: 'q8',
    text: 'At social events, you\'re typically...',
    category: 'Social Energy',
    options: [
      { id: 'q8a', text: 'Energized and mingling with many people', trait: 'E', weight: 90 },
      { id: 'q8b', text: 'Having deep conversations with a few', trait: 'O', weight: 70 },
      { id: 'q8c', text: 'Ready to leave after a while', trait: 'N', weight: 35 },
      { id: 'q8d', text: 'Making sure everyone feels included', trait: 'A', weight: 80 }
    ]
  },
  {
    id: 'q9',
    text: 'When learning something new, you prefer...',
    category: 'Learning Style',
    options: [
      { id: 'q9a', text: 'Experimenting and figuring it out', trait: 'O', weight: 80 },
      { id: 'q9b', text: 'Following a structured tutorial', trait: 'C', weight: 80 },
      { id: 'q9c', text: 'Learning alongside others', trait: 'E', weight: 70 },
      { id: 'q9d', text: 'Taking your time without pressure', trait: 'N', weight: 40 }
    ]
  },
  {
    id: 'q10',
    text: 'People who know you well would say you\'re...',
    category: 'Core Identity',
    options: [
      { id: 'q10a', text: 'Creative and full of ideas', trait: 'O', weight: 85 },
      { id: 'q10b', text: 'Reliable and organized', trait: 'C', weight: 85 },
      { id: 'q10c', text: 'Fun and outgoing', trait: 'E', weight: 85 },
      { id: 'q10d', text: 'Kind and supportive', trait: 'A', weight: 85 }
    ]
  }
];

export const useQuickAssessment = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, QuestionOption>>(new Map());

  const currentQuestion = QUICK_ASSESSMENT_QUESTIONS[currentIndex];
  const totalQuestions = QUICK_ASSESSMENT_QUESTIONS.length;
  const isComplete = currentIndex >= totalQuestions;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const answerQuestion = useCallback((option: QuestionOption) => {
    setAnswers(prev => {
      const next = new Map(prev);
      next.set(currentQuestion.id, option);
      return next;
    });
  }, [currentQuestion?.id]);

  const nextQuestion = useCallback(() => {
    if (currentIndex < totalQuestions) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, totalQuestions]);

  const prevQuestion = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const goToQuestion = useCallback((index: number) => {
    if (index >= 0 && index < totalQuestions) {
      setCurrentIndex(index);
    }
  }, [totalQuestions]);

  const getSelectedAnswer = useCallback((questionId: string) => {
    return answers.get(questionId);
  }, [answers]);

  const getAllAnswers = useCallback(() => {
    return Array.from(answers.entries()).map(([questionId, option]) => ({
      questionId,
      trait: option.trait,
      value: option.weight
    }));
  }, [answers]);

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setAnswers(new Map());
  }, []);

  return {
    currentQuestion,
    currentIndex,
    totalQuestions,
    isComplete,
    isLastQuestion,
    progress: (currentIndex / totalQuestions) * 100,
    answeredCount: answers.size,
    answerQuestion,
    nextQuestion,
    prevQuestion,
    goToQuestion,
    getSelectedAnswer,
    getAllAnswers,
    reset,
    hasAnsweredCurrent: currentQuestion ? answers.has(currentQuestion.id) : false
  };
};
