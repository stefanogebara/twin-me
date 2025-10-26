import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AcademicHierarchy, type AcademicStructure } from '@/components/ui/AcademicHierarchy';
import EnhancedFileUpload from '@/components/ui/EnhancedFileUpload';

const TwinBuilder = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('identity');
  const [isRecording, setIsRecording] = useState(false);
  const [currentTwinId, setCurrentTwinId] = useState<string>(''); // Will be set after twin creation
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [academicStructure, setAcademicStructure] = useState<AcademicStructure | undefined>();
  const [toggleStates, setToggleStates] = useState({
    questions: true,
    humor: false,
    examples: true,
    understanding: true,
    autoLearn: true,
    approval: false,
  });

  const switchTab = (tabName: string) => {
    setActiveTab(tabName);
  };

  const toggleSwitch = (key: string) => {
    setToggleStates(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev]
    }));
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const handleFileUploadComplete = (file: { fileName: string; chunksProcessed: number; totalCharacters: number; processedAt: string }) => {
    setUploadedFiles(prev => [...prev, file]);
    console.log('File uploaded successfully:', file);
  };

  return (
    <div className="bg-[#FAF9F5] text-[#141413] h-screen overflow-hidden">
      <div className="flex h-screen">
        {/* Configuration Panel */}
        <div className="w-[500px] bg-card border-r overflow-y-auto p-8" style={{ borderColor: "hsl(var(--border))" }}>
          <h2 className="mb-6 text-[32px] font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Configure Your Twin</h2>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-8 pb-4" style={{ borderBottom: '2px solid rgba(20,20,19,0.1)' }}>
            {[
              { key: 'identity', label: 'Identity' },
              { key: 'teaching', label: 'Teaching Style' },
              { key: 'content', label: 'Content' },
              { key: 'training', label: 'Training' }
            ].map((tab) => (
              <button
                key={tab.key}
                className={`py-[10px] px-5 bg-transparent border-none text-sm font-medium cursor-pointer relative ${
                  activeTab === tab.key ? 'text-[#141413]' : 'text-[#6B7280]'
                }`}
                style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
                onClick={() => switchTab(tab.key)}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute -bottom-[22px] left-0 right-0 h-[2px] bg-[#D97706]"></div>
                )}
              </button>
            ))}
          </div>
          
          {/* Identity Tab */}
          {activeTab === 'identity' && (
            <div>
              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Basic Information</h3>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Twin Name</label>
                  <input
                    type="text"
                    placeholder="Dr. Smith - Physics 101"
                    className="w-full py-3 px-4 rounded-xl text-sm focus:outline-none bg-[#F5F5F5]"
                    style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}
                  />
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Description</label>
                  <textarea
                    rows={3}
                    placeholder="A digital twin specializing in quantum mechanics..."
                    className="w-full py-3 px-4 rounded-xl text-sm focus:outline-none bg-[#F5F5F5]"
                    style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}
                  ></textarea>
                </div>
                <div className="mb-5">
                  <AcademicHierarchy
                    value={academicStructure}
                    onChange={setAcademicStructure}
                    allowCustom={true}
                  />
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Voice Profile</h3>
                <div className="bg-[#FAF9F5] rounded-2xl p-6 text-center mb-5">
                  <p className="mb-4" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: "hsl(var(--foreground))" }}>Record a sample to clone your voice</p>
                  <button
                    className={`w-20 h-20 rounded-full border-none text-white text-[32px] cursor-pointer my-5 mx-auto flex items-center justify-center ${
                      isRecording
                        ? 'bg-[#DC2626]'
                        : 'bg-[#D97706]'
                    }`}
                    onClick={toggleRecording}
                  >
                    {isRecording ? '◼' : '●'}
                  </button>
                  <p className="text-xs text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Click to start recording (2 min minimum)</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Teaching Style Tab */}
          {activeTab === 'teaching' && (
            <div>
              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Teaching Approach</h3>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Primary Method</label>
                  <select className="w-full py-3 px-4 rounded-xl text-sm focus:outline-none bg-[#F5F5F5]" style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}>
                    <option>Socratic Method - Question-based</option>
                    <option>Direct Instruction</option>
                    <option>Project-Based Learning</option>
                    <option>Flipped Classroom</option>
                  </select>
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Common Phrases</label>
                  <textarea
                    rows={3}
                    placeholder="Let me put it this way..., The key insight here is..."
                    className="w-full py-3 px-4 rounded-xl text-sm focus:outline-none bg-[#F5F5F5]"
                    style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}
                  ></textarea>
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Favorite Analogies</label>
                  <textarea
                    rows={3}
                    placeholder="I like to explain quantum entanglement like two dancers..."
                    className="w-full py-3 px-4 rounded-xl text-sm focus:outline-none bg-[#F5F5F5]"
                    style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}
                  ></textarea>
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Interaction Preferences</h3>
                {[
                  { key: 'questions', label: 'Encourage questions' },
                  { key: 'humor', label: 'Use humor' },
                  { key: 'examples', label: 'Provide examples' },
                  { key: 'understanding', label: 'Check understanding' }
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3">
                    <span className="text-sm text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>{item.label}</span>
                    <div
                      className={`w-12 h-6 rounded-xl cursor-pointer relative ${
                        toggleStates[item.key as keyof typeof toggleStates] ? 'bg-[#D97706]' : 'bg-[#F5F5F5]'
                      }`}
                      style={{ border: '1px solid rgba(20,20,19,0.1)' }}
                      onClick={() => toggleSwitch(item.key)}
                    >
                      <div
                        className={`absolute w-5 h-5 bg-white rounded-full top-[2px] ${
                          toggleStates[item.key as keyof typeof toggleStates] ? 'translate-x-6 left-[2px]' : 'left-[2px]'
                        }`}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Content Tab */}
          {activeTab === 'content' && (
            <div>
              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Upload Training Materials</h3>
                <EnhancedFileUpload
                  twinId={currentTwinId}
                  onUploadComplete={handleFileUploadComplete}
                  maxFiles={15}
                  title="Upload Educational Materials"
                  description="Upload syllabus, lecture notes, textbooks, presentations, and other course materials"
                  className="mb-6"
                />
              </div>

              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Uploaded Files</h3>
                {uploadedFiles.length === 0 ? (
                  <div className="text-center py-8 text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                    <p>No files uploaded yet</p>
                    <p className="text-sm mt-2">Upload documents above to start training your twin</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="bg-card rounded-lg p-4" style={{ border: '1px solid rgba(20,20,19,0.1)' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">📄</span>
                            <div>
                              <h5 className="font-medium text-[#141413] text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                                {file.fileName || file.result?.fileName || 'Unknown file'}
                              </h5>
                              <p className="text-xs text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                                Uploaded successfully
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-[#4CAF50]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>✓ Processed</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Knowledge Base Progress</h3>
                <div className="bg-[#F5F5F5] h-[6px] rounded-[3px] overflow-hidden mb-5">
                  <div
                    className="h-full bg-[#D97706] rounded-[3px]"
                    style={{ width: `${Math.min((uploadedFiles.length / 5) * 100, 100)}%` }}
                  ></div>
                </div>
                <p className="text-sm text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                  {uploadedFiles.length} document{uploadedFiles.length !== 1 ? 's' : ''} processed
                  {uploadedFiles.length === 0 && ', upload files to begin training'}
                </p>
              </div>
            </div>
          )}
          
          {/* Training Tab */}
          {activeTab === 'training' && (
            <div>
              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Live Training Session</h3>
                <p className="text-[#6B7280] mb-5" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
                  Have a conversation with your twin to refine its responses
                </p>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>Sample Questions</label>
                  {[
                    'How do you explain complex topics to beginners?',
                    'What\'s your teaching philosophy?',
                    'How do you handle student confusion?'
                  ].map((question, index) => (
                    <div key={index} className="bg-[#FAF9F5] rounded-xl p-4 mb-3">
                      <p className="text-sm" style={{ fontFamily: 'var(--_typography---font--tiempos)', color: "hsl(var(--foreground))" }}>{question}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-10">
                <h3 className="text-[24px] mb-5 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Fine-tuning Options</h3>
                {[
                  { key: 'autoLearn', label: 'Auto-learn from conversations' },
                  { key: 'approval', label: 'Require approval for updates' }
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3">
                    <span className="text-sm text-[#141413]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>{item.label}</span>
                    <div
                      className={`w-12 h-6 rounded-xl cursor-pointer relative ${
                        toggleStates[item.key as keyof typeof toggleStates] ? 'bg-[#D97706]' : 'bg-[#F5F5F5]'
                      }`}
                      style={{ border: '1px solid rgba(20,20,19,0.1)' }}
                      onClick={() => toggleSwitch(item.key)}
                    >
                      <div
                        className={`absolute w-5 h-5 bg-white rounded-full top-[2px] ${
                          toggleStates[item.key as keyof typeof toggleStates] ? 'translate-x-6 left-[2px]' : 'left-[2px]'
                        }`}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex gap-4 mt-8">
            <button className="py-[14px] px-8 rounded-full font-medium text-sm cursor-pointer bg-card text-[#141413]" style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}>
              Save Draft
            </button>
            <button
              className="btn-anthropic-primary flex-1 py-[14px] px-8 rounded-full font-medium text-sm cursor-pointer border-none"
              style={{ fontFamily: 'var(--_typography---font--tiempos)' }}
              onClick={() => navigate('/soul-signature')}
            >
              Activate Twin
            </button>
          </div>
        </div>
        
        {/* Preview Panel */}
        <div className="flex-1 bg-[#FAF9F5] flex flex-col">
          <div className="p-8 bg-card" style={{ borderBottom: '1px solid rgba(20,20,19,0.1)' }}>
            <h2 className="text-[32px] mb-2 font-medium" style={{ fontFamily: 'var(--_typography---font--styrene-a)', fontWeight: 500, letterSpacing: '-0.02em', color: "hsl(var(--foreground))" }}>Live Preview</h2>
            <div className="flex items-center gap-2 text-sm text-[#6B7280]" style={{ fontFamily: 'var(--_typography---font--tiempos)' }}>
              <div className="w-2 h-2 rounded-full bg-[#4CAF50]"></div>
              <span>Twin is learning...</span>
            </div>
          </div>

          <div className="flex-1 p-8 overflow-y-auto">
            <div className="mb-6 text-right">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-card text-[#141413]" style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}>
                Can you explain quantum entanglement?
              </div>
            </div>

            <div className="mb-6">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] text-[#141413]" style={{ backgroundColor: 'rgba(217,119,6,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}>
                Let me put it this way - imagine two dancers who learned the same choreography. Even when they're on opposite sides of the world, if one spins left, the other spins right, instantly. That's the essence of quantum entanglement.
              </div>
            </div>

            <div className="mb-6 text-right">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-card text-[#141413]" style={{ border: '1px solid rgba(20,20,19,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}>
                That's interesting! But how does it actually work?
              </div>
            </div>

            <div className="mb-6">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] text-[#141413]" style={{ backgroundColor: 'rgba(217,119,6,0.1)', fontFamily: 'var(--_typography---font--tiempos)' }}>
                The key insight here is that entangled particles share a quantum state. When we measure one particle, we instantly know the state of its partner, regardless of distance. It's not that information travels between them - they were always connected at the quantum level.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TwinBuilder;