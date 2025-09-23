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
    <div className="bg-[hsl(var(--lenny-cream))] text-[hsl(var(--lenny-black))] h-screen overflow-hidden">
      <div className="flex h-screen">
        {/* Configuration Panel */}
        <div className="w-[500px] bg-white border-r border-[#E5E7EB] overflow-y-auto p-8">
          <h2 className="font-display mb-6 text-[32px] font-medium gradient-text">Configure Your Twin</h2>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-8 border-b-2 border-[#E5E7EB] pb-4">
            {[
              { key: 'identity', label: 'Identity' },
              { key: 'teaching', label: 'Teaching Style' },
              { key: 'content', label: 'Content' },
              { key: 'training', label: 'Training' }
            ].map((tab) => (
              <button
                key={tab.key}
                className={`py-[10px] px-5 bg-transparent border-none text-sm font-medium cursor-pointer transition-all duration-300 relative ${
                  activeTab === tab.key ? 'text-[hsl(var(--lenny-black))]' : 'text-[hsl(var(--muted-foreground))]'
                }`}
                onClick={() => switchTab(tab.key)}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute -bottom-[22px] left-0 right-0 h-[2px] bg-[hsl(var(--lenny-orange))]"></div>
                )}
              </button>
            ))}
          </div>
          
          {/* Identity Tab */}
          {activeTab === 'identity' && (
            <div>
              <div className="mb-10">
                <h3 className="font-heading text-[24px] mb-5 font-medium">Basic Information</h3>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))]">Twin Name</label>
                  <input
                    type="text"
                    placeholder="Dr. Smith - Physics 101"
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl text-sm transition-all duration-300 focus:outline-none focus:border-[hsl(var(--lenny-orange))] focus:bg-[#FFFBF8]"
                  />
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))]">Description</label>
                  <textarea
                    rows={3}
                    placeholder="A digital twin specializing in quantum mechanics..."
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl text-sm transition-all duration-300 focus:outline-none focus:border-[hsl(var(--lenny-orange))] focus:bg-[#FFFBF8]"
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
                <h3 className="font-heading text-[24px] mb-5 font-medium">Voice Profile</h3>
                <div className="bg-[hsl(var(--lenny-cream))] rounded-2xl p-6 text-center mb-5">
                  <p className="mb-4">Record a sample to clone your voice</p>
                  <button 
                    className={`w-20 h-20 rounded-full border-none text-white text-[32px] cursor-pointer transition-all duration-300 my-5 mx-auto flex items-center justify-center ${
                      isRecording 
                        ? 'bg-[#DC2626] animate-pulse' 
                        : 'bg-[hsl(var(--lenny-orange))] hover:scale-110 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]'
                    }`}
                    onClick={toggleRecording}
                  >
                    {isRecording ? '◼' : '●'}
                  </button>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Click to start recording (2 min minimum)</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Teaching Style Tab */}
          {activeTab === 'teaching' && (
            <div>
              <div className="mb-10">
                <h3 className="font-heading text-[24px] mb-5 font-medium">Teaching Approach</h3>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))]">Primary Method</label>
                  <select className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl text-sm transition-all duration-300 focus:outline-none focus:border-[hsl(var(--lenny-orange))] focus:bg-[#FFFBF8]">
                    <option>Socratic Method - Question-based</option>
                    <option>Direct Instruction</option>
                    <option>Project-Based Learning</option>
                    <option>Flipped Classroom</option>
                  </select>
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))]">Common Phrases</label>
                  <textarea
                    rows={3}
                    placeholder="Let me put it this way..., The key insight here is..."
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl text-sm transition-all duration-300 focus:outline-none focus:border-[hsl(var(--lenny-orange))] focus:bg-[#FFFBF8]"
                  ></textarea>
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))]">Favorite Analogies</label>
                  <textarea
                    rows={3}
                    placeholder="I like to explain quantum entanglement like two dancers..."
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl text-sm transition-all duration-300 focus:outline-none focus:border-[hsl(var(--lenny-orange))] focus:bg-[#FFFBF8]"
                  ></textarea>
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="font-heading text-[24px] mb-5 font-medium">Interaction Preferences</h3>
                {[
                  { key: 'questions', label: 'Encourage questions' },
                  { key: 'humor', label: 'Use humor' },
                  { key: 'examples', label: 'Provide examples' },
                  { key: 'understanding', label: 'Check understanding' }
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3">
                    <span className="text-sm text-[hsl(var(--lenny-black))]">{item.label}</span>
                    <div 
                      className={`w-12 h-6 rounded-xl cursor-pointer transition-all duration-300 relative ${
                        toggleStates[item.key as keyof typeof toggleStates] ? 'bg-[hsl(var(--lenny-orange))]' : 'bg-[#E5E7EB]'
                      }`}
                      onClick={() => toggleSwitch(item.key)}
                    >
                      <div 
                        className={`absolute w-5 h-5 bg-white rounded-full top-[2px] transition-transform duration-300 ${
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
                <h3 className="font-heading text-[24px] mb-5 font-medium">Upload Training Materials</h3>
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
                <h3 className="font-heading text-[24px] mb-5 font-medium">Uploaded Files</h3>
                {uploadedFiles.length === 0 ? (
                  <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
                    <p>No files uploaded yet</p>
                    <p className="text-sm mt-2">Upload documents above to start training your twin</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">📄</span>
                            <div>
                              <h5 className="font-medium text-[hsl(var(--lenny-black))] text-sm">
                                {file.fileName || file.result?.fileName || 'Unknown file'}
                              </h5>
                              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                Uploaded successfully
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-[#4CAF50]">✓ Processed</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-10">
                <h3 className="font-heading text-[24px] mb-5 font-medium">Knowledge Base Progress</h3>
                <div className="bg-[#E5E7EB] h-[6px] rounded-[3px] overflow-hidden mb-5">
                  <div
                    className="h-full bg-gradient-to-r from-[hsl(var(--lenny-orange))] to-[#FF9800] rounded-[3px] transition-all duration-300"
                    style={{ width: `${Math.min((uploadedFiles.length / 5) * 100, 100)}%` }}
                  ></div>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
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
                <h3 className="font-heading text-[24px] mb-5 font-medium">Live Training Session</h3>
                <p className="text-[hsl(var(--muted-foreground))] mb-5">
                  Have a conversation with your twin to refine its responses
                </p>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[hsl(var(--lenny-black))]">Sample Questions</label>
                  {[
                    'How do you explain complex topics to beginners?',
                    'What\'s your teaching philosophy?',
                    'How do you handle student confusion?'
                  ].map((question, index) => (
                    <div key={index} className="bg-[hsl(var(--lenny-cream))] rounded-xl p-4 mb-3">
                      <p className="text-sm">{question}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="font-heading text-[24px] mb-5 font-medium">Fine-tuning Options</h3>
                {[
                  { key: 'autoLearn', label: 'Auto-learn from conversations' },
                  { key: 'approval', label: 'Require approval for updates' }
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3">
                    <span className="text-sm text-[hsl(var(--lenny-black))]">{item.label}</span>
                    <div 
                      className={`w-12 h-6 rounded-xl cursor-pointer transition-all duration-300 relative ${
                        toggleStates[item.key as keyof typeof toggleStates] ? 'bg-[hsl(var(--lenny-orange))]' : 'bg-[#E5E7EB]'
                      }`}
                      onClick={() => toggleSwitch(item.key)}
                    >
                      <div 
                        className={`absolute w-5 h-5 bg-white rounded-full top-[2px] transition-transform duration-300 ${
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
            <button className="btn-lenny-secondary py-[14px] px-8 rounded-full font-medium text-sm cursor-pointer transition-all duration-300">
              Save Draft
            </button>
            <button 
              className="btn-lenny flex-1 py-[14px] px-8 rounded-full font-medium text-sm cursor-pointer transition-all duration-300 border-none hover:transform hover:translate-y-[-2px]"
              onClick={() => navigate('/twin-activation')}
            >
              Activate Twin
            </button>
          </div>
        </div>
        
        {/* Preview Panel */}
        <div className="flex-1 bg-[hsl(var(--lenny-cream))] flex flex-col">
          <div className="p-8 bg-white border-b border-[#E5E7EB]">
            <h2 className="font-display text-[32px] mb-2 font-medium gradient-text">Live Preview</h2>
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <div className="w-2 h-2 rounded-full bg-[#4CAF50] animate-pulse"></div>
              <span>Twin is learning...</span>
            </div>
          </div>
          
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="mb-6 text-right animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-white text-[hsl(var(--lenny-black))] border border-[#E5E7EB]">
                Can you explain quantum entanglement?
              </div>
            </div>
            
            <div className="mb-6 animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-gradient-to-br from-[rgba(255,87,34,0.1)] to-[rgba(255,152,0,0.1)] text-[hsl(var(--lenny-black))]">
                Let me put it this way - imagine two dancers who learned the same choreography. Even when they're on opposite sides of the world, if one spins left, the other spins right, instantly. That's the essence of quantum entanglement.
              </div>
            </div>
            
            <div className="mb-6 text-right animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-white text-[hsl(var(--lenny-black))] border border-[#E5E7EB]">
                That's interesting! But how does it actually work?
              </div>
            </div>
            
            <div className="mb-6 animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-gradient-to-br from-[rgba(255,87,34,0.1)] to-[rgba(255,152,0,0.1)] text-[hsl(var(--lenny-black))]">
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