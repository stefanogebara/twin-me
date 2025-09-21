import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TwinBuilder = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('identity');
  const [isRecording, setIsRecording] = useState(false);
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

  return (
    <div className="font-inter bg-[#FBF7F0] text-[#1A1A4B] h-screen overflow-hidden">
      <div className="flex h-screen">
        {/* Configuration Panel */}
        <div className="w-[500px] bg-white border-r border-[#E5E7EB] overflow-y-auto p-8">
          <h2 className="font-playfair mb-6 text-[32px] font-normal italic">Configure Your Twin</h2>
          
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
                className={`py-[10px] px-5 bg-transparent border-none font-inter text-sm font-medium cursor-pointer transition-all duration-300 relative ${
                  activeTab === tab.key ? 'text-[#1A1A4B]' : 'text-[#6B7280]'
                }`}
                onClick={() => switchTab(tab.key)}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <div className="absolute -bottom-[22px] left-0 right-0 h-[2px] bg-[#FF5722]"></div>
                )}
              </button>
            ))}
          </div>
          
          {/* Identity Tab */}
          {activeTab === 'identity' && (
            <div>
              <div className="mb-10">
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Basic Information</h3>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Twin Name</label>
                  <input 
                    type="text" 
                    placeholder="Dr. Smith - Physics 101"
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                  />
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Description</label>
                  <textarea 
                    rows={3} 
                    placeholder="A digital twin specializing in quantum mechanics..."
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                  ></textarea>
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Expertise Areas</label>
                  <input 
                    type="text" 
                    placeholder="Quantum Physics, Theoretical Physics, Mathematics"
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                  />
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Voice Profile</h3>
                <div className="bg-[#FBF7F0] rounded-2xl p-6 text-center mb-5">
                  <p className="mb-4">Record a sample to clone your voice</p>
                  <button 
                    className={`w-20 h-20 rounded-full border-none text-white text-[32px] cursor-pointer transition-all duration-300 my-5 mx-auto flex items-center justify-center ${
                      isRecording 
                        ? 'bg-[#DC2626] animate-pulse' 
                        : 'bg-[#FF5722] hover:scale-110 hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]'
                    }`}
                    onClick={toggleRecording}
                  >
                    {isRecording ? '◼' : '●'}
                  </button>
                  <p className="text-xs text-[#6B7280]">Click to start recording (2 min minimum)</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Teaching Style Tab */}
          {activeTab === 'teaching' && (
            <div>
              <div className="mb-10">
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Teaching Approach</h3>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Primary Method</label>
                  <select className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]">
                    <option>Socratic Method - Question-based</option>
                    <option>Direct Instruction</option>
                    <option>Project-Based Learning</option>
                    <option>Flipped Classroom</option>
                  </select>
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Common Phrases</label>
                  <textarea 
                    rows={3} 
                    placeholder="Let me put it this way..., The key insight here is..."
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                  ></textarea>
                </div>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Favorite Analogies</label>
                  <textarea 
                    rows={3} 
                    placeholder="I like to explain quantum entanglement like two dancers..."
                    className="w-full py-3 px-4 border-2 border-[#E5E7EB] rounded-xl font-inter text-sm transition-all duration-300 focus:outline-none focus:border-[#FF5722] focus:bg-[#FFFBF8]"
                  ></textarea>
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Interaction Preferences</h3>
                {[
                  { key: 'questions', label: 'Encourage questions' },
                  { key: 'humor', label: 'Use humor' },
                  { key: 'examples', label: 'Provide examples' },
                  { key: 'understanding', label: 'Check understanding' }
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3">
                    <span className="text-sm text-[#1A1A4B]">{item.label}</span>
                    <div 
                      className={`w-12 h-6 rounded-xl cursor-pointer transition-all duration-300 relative ${
                        toggleStates[item.key as keyof typeof toggleStates] ? 'bg-[#FF5722]' : 'bg-[#E5E7EB]'
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
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Upload Materials</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { icon: '📹', label: 'Video Lectures', count: '0 uploaded', uploaded: false },
                    { icon: '📄', label: 'Documents', count: '12 uploaded', uploaded: true },
                    { icon: '🎤', label: 'Audio', count: '3 uploaded', uploaded: true },
                    { icon: '💬', label: 'Chat Logs', count: '0 uploaded', uploaded: false }
                  ].map((item, index) => (
                    <div 
                      key={index}
                      className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all duration-300 hover:border-[#FF5722] hover:transform hover:translate-y-[-2px] ${
                        item.uploaded ? 'bg-[#F0FDF4] border-[#4CAF50]' : 'border-[#E5E7EB]'
                      }`}
                    >
                      <div className="text-2xl mb-2">{item.icon}</div>
                      <div className="font-medium text-sm">{item.label}</div>
                      <div className={`text-xs ${item.uploaded ? 'text-[#4CAF50]' : 'text-[#6B7280]'}`}>
                        {item.count}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Knowledge Base Progress</h3>
                <div className="bg-[#E5E7EB] h-[6px] rounded-[3px] overflow-hidden mb-5">
                  <div className="h-full bg-gradient-to-r from-[#FF5722] to-[#FF9800] rounded-[3px] transition-all duration-300 w-[65%]"></div>
                </div>
                <p className="text-sm text-[#6B7280]">15 documents processed, 8 pending</p>
              </div>
            </div>
          )}
          
          {/* Training Tab */}
          {activeTab === 'training' && (
            <div>
              <div className="mb-10">
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Live Training Session</h3>
                <p className="text-[#6B7280] mb-5">
                  Have a conversation with your twin to refine its responses
                </p>
                <div className="mb-5">
                  <label className="block mb-2 text-sm font-medium text-[#1A1A4B]">Sample Questions</label>
                  {[
                    'How do you explain complex topics to beginners?',
                    'What\'s your teaching philosophy?',
                    'How do you handle student confusion?'
                  ].map((question, index) => (
                    <div key={index} className="bg-[#FBF7F0] rounded-xl p-4 mb-3">
                      <p className="text-sm">{question}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mb-10">
                <h3 className="font-playfair text-[24px] mb-5 font-normal italic">Fine-tuning Options</h3>
                {[
                  { key: 'autoLearn', label: 'Auto-learn from conversations' },
                  { key: 'approval', label: 'Require approval for updates' }
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3">
                    <span className="text-sm text-[#1A1A4B]">{item.label}</span>
                    <div 
                      className={`w-12 h-6 rounded-xl cursor-pointer transition-all duration-300 relative ${
                        toggleStates[item.key as keyof typeof toggleStates] ? 'bg-[#FF5722]' : 'bg-[#E5E7EB]'
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
            <button className="py-[14px] px-8 rounded-full bg-transparent text-[#1A1A4B] border-2 border-[#1A1A4B] font-medium text-sm cursor-pointer transition-all duration-300 hover:bg-[#1A1A4B] hover:text-white">
              Save Draft
            </button>
            <button 
              className="flex-1 py-[14px] px-8 rounded-full bg-[#FF5722] text-white font-medium text-sm cursor-pointer transition-all duration-300 border-none hover:transform hover:translate-y-[-2px] hover:shadow-[0_8px_24px_rgba(255,87,34,0.3)]"
              onClick={() => navigate('/twin-activation')}
            >
              Activate Twin
            </button>
          </div>
        </div>
        
        {/* Preview Panel */}
        <div className="flex-1 bg-[#FBF7F0] flex flex-col">
          <div className="p-8 bg-white border-b border-[#E5E7EB]">
            <h2 className="font-playfair text-[32px] mb-2 font-normal italic">Live Preview</h2>
            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
              <div className="w-2 h-2 rounded-full bg-[#4CAF50] animate-pulse"></div>
              <span>Twin is learning...</span>
            </div>
          </div>
          
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="mb-6 text-right animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-white text-[#1A1A4B] border border-[#E5E7EB]">
                Can you explain quantum entanglement?
              </div>
            </div>
            
            <div className="mb-6 animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-gradient-to-br from-[rgba(255,87,34,0.1)] to-[rgba(255,152,0,0.1)] text-[#1A1A4B]">
                Let me put it this way - imagine two dancers who learned the same choreography. Even when they're on opposite sides of the world, if one spins left, the other spins right, instantly. That's the essence of quantum entanglement.
              </div>
            </div>
            
            <div className="mb-6 text-right animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-white text-[#1A1A4B] border border-[#E5E7EB]">
                That's interesting! But how does it actually work?
              </div>
            </div>
            
            <div className="mb-6 animate-[slideIn_0.3s_ease]">
              <div className="inline-block max-w-[70%] py-4 px-5 rounded-[20px] text-sm leading-[1.5] bg-gradient-to-br from-[rgba(255,87,34,0.1)] to-[rgba(255,152,0,0.1)] text-[#1A1A4B]">
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