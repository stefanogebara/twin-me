import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, Building2, Users, GraduationCap, BookOpen, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export interface AcademicStructure {
  university: string;
  department: string;
  major: string;
  yearLevel: string;
  subject: string;
  subjectCode?: string;
  credits?: number;
}

interface AcademicHierarchyProps {
  value?: AcademicStructure;
  onChange: (structure: AcademicStructure) => void;
  allowCustom?: boolean;
  className?: string;
}

interface UniversityData {
  id: string;
  name: string;
  country: string;
  departments: DepartmentData[];
}

interface DepartmentData {
  id: string;
  name: string;
  majors: MajorData[];
}

interface MajorData {
  id: string;
  name: string;
  degree: string;
  yearLevels: YearLevelData[];
}

interface YearLevelData {
  id: string;
  name: string;
  level: number;
  subjects: SubjectData[];
}

interface SubjectData {
  id: string;
  name: string;
  code: string;
  credits: number;
  prerequisites?: string[];
}

// Mock data structure - In production, this would come from your backend
const UNIVERSITY_DATA: UniversityData[] = [
  {
    id: 'ie-university',
    name: 'IE University',
    country: 'Spain',
    departments: [
      {
        id: 'ie-school-global-public-affairs',
        name: 'IE School of Global and Public Affairs',
        majors: [
          {
            id: 'international-relations',
            name: 'International Relations',
            degree: 'Bachelor in International Relations',
            yearLevels: [
              {
                id: 'first-year',
                name: 'First Year',
                level: 1,
                subjects: [
                  { id: 'intro-ir', name: 'Introduction to International Relations', code: 'IR 101', credits: 6 },
                  { id: 'political-theory', name: 'Political Theory', code: 'POL 101', credits: 6 },
                  { id: 'microeconomics', name: 'Microeconomics', code: 'ECON 101', credits: 6 },
                  { id: 'history-modern-world', name: 'History of the Modern World', code: 'HIST 101', credits: 6 }
                ]
              },
              {
                id: 'second-year',
                name: 'Second Year',
                level: 2,
                subjects: [
                  { id: 'comparative-politics', name: 'Comparative Politics', code: 'POL 201', credits: 6 },
                  { id: 'international-law', name: 'International Law', code: 'LAW 201', credits: 6 },
                  { id: 'macroeconomics', name: 'Macroeconomics', code: 'ECON 201', credits: 6 }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'ie-business-school',
        name: 'IE Business School',
        majors: [
          {
            id: 'business-administration',
            name: 'Business Administration',
            degree: 'Bachelor in Business Administration',
            yearLevels: [
              {
                id: 'first-year',
                name: 'First Year',
                level: 1,
                subjects: [
                  { id: 'intro-business', name: 'Introduction to Business', code: 'BUS 101', credits: 6 },
                  { id: 'accounting-principles', name: 'Accounting Principles', code: 'ACC 101', credits: 6 },
                  { id: 'business-math', name: 'Business Mathematics', code: 'MATH 101', credits: 6 },
                  { id: 'business-communication', name: 'Business Communication', code: 'COM 101', credits: 6 }
                ]
              },
              {
                id: 'second-year',
                name: 'Second Year',
                level: 2,
                subjects: [
                  { id: 'corporate-finance', name: 'Corporate Finance', code: 'FIN 201', credits: 6 },
                  { id: 'marketing-principles', name: 'Marketing Principles', code: 'MKT 201', credits: 6 },
                  { id: 'operations-management', name: 'Operations Management', code: 'OPS 201', credits: 6 }
                ]
              },
              {
                id: 'third-year',
                name: 'Third Year',
                level: 3,
                subjects: [
                  { id: 'strategic-management', name: 'Strategic Management', code: 'BUS 301', credits: 6 },
                  { id: 'international-business', name: 'International Business', code: 'BUS 302', credits: 6 },
                  { id: 'business-analytics', name: 'Business Analytics', code: 'BUS 303', credits: 6 }
                ]
              },
              {
                id: 'fourth-year',
                name: 'Fourth Year',
                level: 4,
                subjects: [
                  { id: 'business-capstone', name: 'Business Capstone Project', code: 'BUS 401', credits: 12 },
                  { id: 'entrepreneurship', name: 'Entrepreneurship', code: 'BUS 402', credits: 6 },
                  { id: 'business-ethics', name: 'Business Ethics', code: 'BUS 403', credits: 6 }
                ]
              }
            ]
          },
          {
            id: 'management-information-systems',
            name: 'Management Information Systems',
            degree: 'Bachelor in Management Information Systems',
            yearLevels: [
              {
                id: 'first-year',
                name: 'First Year',
                level: 1,
                subjects: [
                  { id: 'intro-mis', name: 'Introduction to MIS', code: 'MIS 101', credits: 6 },
                  { id: 'programming-fundamentals', name: 'Programming Fundamentals', code: 'CS 101', credits: 6 },
                  { id: 'database-systems', name: 'Database Systems', code: 'CS 201', credits: 6 }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'ie-school-science-technology',
        name: 'IE School of Science and Technology',
        majors: [
          {
            id: 'computer-science-ai',
            name: 'Computer Science and Artificial Intelligence',
            degree: 'Bachelor in Computer Science and Artificial Intelligence',
            yearLevels: [
              {
                id: 'first-year',
                name: 'First Year',
                level: 1,
                subjects: [
                  { id: 'programming-i', name: 'Programming I', code: 'CS 101', credits: 6 },
                  { id: 'calculus-i', name: 'Calculus I', code: 'MATH 101', credits: 6 },
                  { id: 'discrete-math', name: 'Discrete Mathematics', code: 'MATH 111', credits: 6 },
                  { id: 'physics-i', name: 'Physics I', code: 'PHYS 101', credits: 6 }
                ]
              },
              {
                id: 'second-year',
                name: 'Second Year',
                level: 2,
                subjects: [
                  { id: 'data-structures', name: 'Data Structures and Algorithms', code: 'CS 201', credits: 6 },
                  { id: 'linear-algebra', name: 'Linear Algebra', code: 'MATH 201', credits: 6 },
                  { id: 'intro-ai', name: 'Introduction to Artificial Intelligence', code: 'AI 201', credits: 6 }
                ]
              },
              {
                id: 'third-year',
                name: 'Third Year',
                level: 3,
                subjects: [
                  { id: 'machine-learning', name: 'Machine Learning', code: 'AI 301', credits: 6 },
                  { id: 'deep-learning', name: 'Deep Learning', code: 'AI 302', credits: 6 },
                  { id: 'computer-vision', name: 'Computer Vision', code: 'AI 303', credits: 6 }
                ]
              },
              {
                id: 'fourth-year',
                name: 'Fourth Year',
                level: 4,
                subjects: [
                  { id: 'final-project', name: 'Final Project', code: 'CS 401', credits: 12 },
                  { id: 'advanced-ai', name: 'Advanced AI Systems', code: 'AI 401', credits: 6 },
                  { id: 'ai-ethics', name: 'AI Ethics and Society', code: 'AI 402', credits: 6 }
                ]
              }
            ]
          },
          {
            id: 'bba-cs-ai-dual',
            name: 'BBA + Computer Science and AI (Dual Degree)',
            degree: 'Bachelor in Business Administration + Bachelor in Computer Science and AI',
            yearLevels: [
              {
                id: 'first-year',
                name: 'First Year',
                level: 1,
                subjects: [
                  { id: 'intro-business', name: 'Introduction to Business', code: 'BUS 101', credits: 6 },
                  { id: 'programming-i', name: 'Programming I', code: 'CS 101', credits: 6 },
                  { id: 'calculus-i', name: 'Calculus I', code: 'MATH 101', credits: 6 }
                ]
              },
              {
                id: 'second-year',
                name: 'Second Year',
                level: 2,
                subjects: [
                  { id: 'accounting-principles', name: 'Accounting Principles', code: 'ACC 101', credits: 6 },
                  { id: 'data-structures', name: 'Data Structures and Algorithms', code: 'CS 201', credits: 6 }
                ]
              },
              {
                id: 'third-year',
                name: 'Third Year',
                level: 3,
                subjects: [
                  { id: 'corporate-finance', name: 'Corporate Finance', code: 'FIN 201', credits: 6 },
                  { id: 'machine-learning', name: 'Machine Learning', code: 'AI 301', credits: 6 }
                ]
              },
              {
                id: 'fourth-year',
                name: 'Fourth Year',
                level: 4,
                subjects: [
                  { id: 'strategic-management', name: 'Strategic Management', code: 'BUS 401', credits: 6 },
                  { id: 'advanced-ai', name: 'Advanced AI Systems', code: 'AI 401', credits: 6 }
                ]
              },
              {
                id: 'fifth-year',
                name: 'Fifth Year',
                level: 5,
                subjects: [
                  { id: 'business-final-project', name: 'Business Final Project', code: 'BUS 501', credits: 12 },
                  { id: 'cs-final-project', name: 'CS Final Project', code: 'CS 501', credits: 12 }
                ]
              }
            ]
          },
          {
            id: 'data-applied-science',
            name: 'Data and Applied Science',
            degree: 'Bachelor in Data and Applied Science',
            yearLevels: [
              {
                id: 'first-year',
                name: 'First Year',
                level: 1,
                subjects: [
                  { id: 'intro-data-science', name: 'Introduction to Data Science', code: 'DS 101', credits: 6 },
                  { id: 'statistics', name: 'Statistics', code: 'STAT 101', credits: 6 },
                  { id: 'python-programming', name: 'Python Programming', code: 'CS 101', credits: 6 }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'ie-school-architecture-design',
        name: 'IE School of Architecture and Design',
        majors: [
          {
            id: 'design',
            name: 'Design',
            degree: 'Bachelor in Design',
            yearLevels: [
              {
                id: 'first-year',
                name: 'First Year',
                level: 1,
                subjects: [
                  { id: 'design-fundamentals', name: 'Design Fundamentals', code: 'DES 101', credits: 6 },
                  { id: 'drawing-techniques', name: 'Drawing Techniques', code: 'ART 101', credits: 6 },
                  { id: 'color-theory', name: 'Color Theory', code: 'ART 102', credits: 6 }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'mit',
    name: 'Massachusetts Institute of Technology',
    country: 'USA',
    departments: [
      {
        id: 'engineering',
        name: 'School of Engineering',
        majors: [
          {
            id: 'cs',
            name: 'Computer Science',
            degree: 'Bachelor of Science',
            yearLevels: [
              {
                id: 'freshman',
                name: 'Freshman Year',
                level: 1,
                subjects: [
                  { id: 'cs101', name: 'Introduction to Computer Science', code: 'CS 101', credits: 3 },
                  { id: 'math101', name: 'Calculus I', code: 'MATH 101', credits: 4 },
                  { id: 'phys101', name: 'Physics I', code: 'PHYS 101', credits: 4 }
                ]
              },
              {
                id: 'sophomore',
                name: 'Sophomore Year',
                level: 2,
                subjects: [
                  { id: 'cs201', name: 'Data Structures and Algorithms', code: 'CS 201', credits: 3, prerequisites: ['cs101'] },
                  { id: 'cs202', name: 'Computer Systems', code: 'CS 202', credits: 3 },
                  { id: 'math201', name: 'Linear Algebra', code: 'MATH 201', credits: 3 }
                ]
              }
            ]
          },
          {
            id: 'ee',
            name: 'Electrical Engineering',
            degree: 'Bachelor of Science',
            yearLevels: [
              {
                id: 'freshman',
                name: 'Freshman Year',
                level: 1,
                subjects: [
                  { id: 'ee101', name: 'Introduction to Electrical Engineering', code: 'EE 101', credits: 3 },
                  { id: 'math101', name: 'Calculus I', code: 'MATH 101', credits: 4 },
                  { id: 'phys101', name: 'Physics I', code: 'PHYS 101', credits: 4 }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'business',
        name: 'MIT Sloan School of Management',
        majors: [
          {
            id: 'finance',
            name: 'Finance',
            degree: 'Bachelor of Science',
            yearLevels: [
              {
                id: 'freshman',
                name: 'Freshman Year',
                level: 1,
                subjects: [
                  { id: 'fin101', name: 'Introduction to Finance', code: 'FIN 101', credits: 3 },
                  { id: 'econ101', name: 'Microeconomics', code: 'ECON 101', credits: 3 },
                  { id: 'math101', name: 'Business Mathematics', code: 'MATH 101', credits: 3 }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'stanford',
    name: 'Stanford University',
    country: 'USA',
    departments: [
      {
        id: 'engineering',
        name: 'School of Engineering',
        majors: [
          {
            id: 'cs',
            name: 'Computer Science',
            degree: 'Bachelor of Science',
            yearLevels: [
              {
                id: 'freshman',
                name: 'Freshman Year',
                level: 1,
                subjects: [
                  { id: 'cs106a', name: 'Programming Methodology', code: 'CS 106A', credits: 5 },
                  { id: 'math51', name: 'Linear Algebra and Multivariable Calculus', code: 'MATH 51', credits: 5 }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];

export const AcademicHierarchy: React.FC<AcademicHierarchyProps> = ({
  value,
  onChange,
  allowCustom = true,
  className = ''
}) => {
  const [selectedUniversity, setSelectedUniversity] = useState<UniversityData | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentData | null>(null);
  const [selectedMajor, setSelectedMajor] = useState<MajorData | null>(null);
  const [selectedYearLevel, setSelectedYearLevel] = useState<YearLevelData | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customStructure, setCustomStructure] = useState<AcademicStructure>({
    university: '',
    department: '',
    major: '',
    yearLevel: '',
    subject: '',
    subjectCode: '',
    credits: 3
  });

  // Initialize from value prop
  useEffect(() => {
    if (value) {
      // Try to find matching data
      const university = UNIVERSITY_DATA.find(u => u.name === value.university);
      if (university) {
        setSelectedUniversity(university);
        const department = university.departments.find(d => d.name === value.department);
        if (department) {
          setSelectedDepartment(department);
          const major = department.majors.find(m => m.name === value.major);
          if (major) {
            setSelectedMajor(major);
            const yearLevel = major.yearLevels.find(y => y.name === value.yearLevel);
            if (yearLevel) {
              setSelectedYearLevel(yearLevel);
              const subject = yearLevel.subjects.find(s => s.name === value.subject);
              if (subject) {
                setSelectedSubject(subject);
              }
            }
          }
        }
      }
    }
  }, [value]);

  const handleUniversityChange = (universityId: string) => {
    const university = UNIVERSITY_DATA.find(u => u.id === universityId);
    setSelectedUniversity(university || null);
    setSelectedDepartment(null);
    setSelectedMajor(null);
    setSelectedYearLevel(null);
    setSelectedSubject(null);
  };

  const handleDepartmentChange = (departmentId: string) => {
    if (!selectedUniversity) return;
    const department = selectedUniversity.departments.find(d => d.id === departmentId);
    setSelectedDepartment(department || null);
    setSelectedMajor(null);
    setSelectedYearLevel(null);
    setSelectedSubject(null);
  };

  const handleMajorChange = (majorId: string) => {
    if (!selectedDepartment) return;
    const major = selectedDepartment.majors.find(m => m.id === majorId);
    setSelectedMajor(major || null);
    setSelectedYearLevel(null);
    setSelectedSubject(null);
  };

  const handleYearLevelChange = (yearLevelId: string) => {
    if (!selectedMajor) return;
    const yearLevel = selectedMajor.yearLevels.find(y => y.id === yearLevelId);
    setSelectedYearLevel(yearLevel || null);
    setSelectedSubject(null);
  };

  const handleSubjectChange = (subjectId: string) => {
    if (!selectedYearLevel) return;
    const subject = selectedYearLevel.subjects.find(s => s.id === subjectId);
    setSelectedSubject(subject || null);

    if (subject && selectedUniversity && selectedDepartment && selectedMajor && selectedYearLevel) {
      onChange({
        university: selectedUniversity.name,
        department: selectedDepartment.name,
        major: selectedMajor.name,
        yearLevel: selectedYearLevel.name,
        subject: subject.name,
        subjectCode: subject.code,
        credits: subject.credits
      });
    }
  };

  const handleCustomSubmit = () => {
    if (customStructure.university && customStructure.department && customStructure.major &&
        customStructure.yearLevel && customStructure.subject) {
      onChange(customStructure);
      setShowCustomForm(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Academic Subject Classification</Label>
        {allowCustom && (
          <Dialog open={showCustomForm} onOpenChange={setShowCustomForm}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Custom
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Custom Academic Structure</DialogTitle>
                <DialogDescription>
                  Create a custom academic classification for your subject
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>University/Institution</Label>
                  <Input
                    value={customStructure.university}
                    onChange={(e) => setCustomStructure(prev => ({ ...prev, university: e.target.value }))}
                    placeholder="e.g., Harvard University"
                  />
                </div>
                <div>
                  <Label>Department/Faculty</Label>
                  <Input
                    value={customStructure.department}
                    onChange={(e) => setCustomStructure(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="e.g., School of Engineering"
                  />
                </div>
                <div>
                  <Label>Major/Program</Label>
                  <Input
                    value={customStructure.major}
                    onChange={(e) => setCustomStructure(prev => ({ ...prev, major: e.target.value }))}
                    placeholder="e.g., Computer Science"
                  />
                </div>
                <div>
                  <Label>Year Level</Label>
                  <Input
                    value={customStructure.yearLevel}
                    onChange={(e) => setCustomStructure(prev => ({ ...prev, yearLevel: e.target.value }))}
                    placeholder="e.g., Sophomore Year, Year 2"
                  />
                </div>
                <div>
                  <Label>Subject Name</Label>
                  <Input
                    value={customStructure.subject}
                    onChange={(e) => setCustomStructure(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="e.g., Data Structures and Algorithms"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Subject Code (Optional)</Label>
                    <Input
                      value={customStructure.subjectCode}
                      onChange={(e) => setCustomStructure(prev => ({ ...prev, subjectCode: e.target.value }))}
                      placeholder="e.g., CS 201"
                    />
                  </div>
                  <div>
                    <Label>Credits (Optional)</Label>
                    <Input
                      type="number"
                      value={customStructure.credits}
                      onChange={(e) => setCustomStructure(prev => ({ ...prev, credits: parseInt(e.target.value) || 3 }))}
                      placeholder="3"
                    />
                  </div>
                </div>
                <Button onClick={handleCustomSubmit} className="w-full">
                  Add Custom Subject
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Hierarchical Selection */}
      <div className="grid grid-cols-1 gap-4">
        {/* University Selection */}
        <div>
          <Label className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4" />
            University/Institution
          </Label>
          <Select value={selectedUniversity?.id || ''} onValueChange={handleUniversityChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select university..." />
            </SelectTrigger>
            <SelectContent>
              {UNIVERSITY_DATA.map((university) => (
                <SelectItem key={university.id} value={university.id}>
                  {university.name} ({university.country})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Department Selection */}
        {selectedUniversity && (
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4" />
              Department/Faculty
            </Label>
            <Select value={selectedDepartment?.id || ''} onValueChange={handleDepartmentChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select department..." />
              </SelectTrigger>
              <SelectContent>
                {selectedUniversity.departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Major Selection */}
        {selectedDepartment && (
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-4 h-4" />
              Major/Program
            </Label>
            <Select value={selectedMajor?.id || ''} onValueChange={handleMajorChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select major..." />
              </SelectTrigger>
              <SelectContent>
                {selectedDepartment.majors.map((major) => (
                  <SelectItem key={major.id} value={major.id}>
                    {major.name} ({major.degree})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Year Level Selection */}
        {selectedMajor && (
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4" />
              Year Level
            </Label>
            <Select value={selectedYearLevel?.id || ''} onValueChange={handleYearLevelChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select year level..." />
              </SelectTrigger>
              <SelectContent>
                {selectedMajor.yearLevels.map((yearLevel) => (
                  <SelectItem key={yearLevel.id} value={yearLevel.id}>
                    {yearLevel.name} (Level {yearLevel.level})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Subject Selection */}
        {selectedYearLevel && (
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4" />
              Subject
            </Label>
            <Select value={selectedSubject?.id || ''} onValueChange={handleSubjectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select subject..." />
              </SelectTrigger>
              <SelectContent>
                {selectedYearLevel.subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{subject.name}</span>
                      <div className="flex gap-2 ml-4">
                        <Badge variant="secondary">{subject.code}</Badge>
                        <Badge variant="outline">{subject.credits} credits</Badge>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Selected Structure Display */}
      {value && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Selected Academic Classification:</h4>
          <div className="space-y-1 text-sm">
            <div><strong>University:</strong> {value.university}</div>
            <div><strong>Department:</strong> {value.department}</div>
            <div><strong>Major:</strong> {value.major}</div>
            <div><strong>Year Level:</strong> {value.yearLevel}</div>
            <div><strong>Subject:</strong> {value.subject} {value.subjectCode && `(${value.subjectCode})`}</div>
            {value.credits && <div><strong>Credits:</strong> {value.credits}</div>}
          </div>
        </div>
      )}
    </div>
  );
};