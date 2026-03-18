// Adaptive Learning Service for Lessons 1-4
// Tracks performance and adjusts difficulty

export const DIFFICULTY_LEVELS = {
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard',
  CHALLENGE: 'challenge'
};

export const PERFORMANCE_THRESHOLDS = {
  QUICK_MASTERY: 90, // Score 90%+ on first try
  STRUGGLING: 60, // Score below 60%
  REPEATED_FAILURE: 2 // Failed 2+ times
};

// Store learner performance in localStorage
export const trackPerformance = (moduleId, topicId, data) => {
  const key = `performance_${moduleId}_${topicId}`;
  const existing = getPerformance(moduleId, topicId);
  
  const updated = {
    ...existing,
    attempts: (existing.attempts || 0) + 1,
    scores: [...(existing.scores || []), data.score],
    timeSpent: [...(existing.timeSpent || []), data.timeSpent],
    correctAnswers: data.correctAnswers || [],
    lastAttempt: new Date().toISOString(),
    difficulty: data.difficulty || DIFFICULTY_LEVELS.NORMAL
  };
  
  localStorage.setItem(key, JSON.stringify(updated));
  return updated;
};

export const getPerformance = (moduleId, topicId) => {
  const key = `performance_${moduleId}_${topicId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : {};
};

// Track final assessment performance for challenge mode
export const trackFinalAssessment = (moduleId, data) => {
  const key = `final_assessment_${moduleId}`;
  const existing = getFinalAssessment(moduleId);
  
  const updated = {
    ...existing,
    attempts: (existing.attempts || 0) + 1,
    scores: [...(existing.scores || []), data.score],
    passed: data.score >= 75,
    lastAttempt: new Date().toISOString()
  };
  
  localStorage.setItem(key, JSON.stringify(updated));
  return updated;
};

export const getFinalAssessment = (moduleId) => {
  const key = `final_assessment_${moduleId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : {};
};

export const shouldShowHints = (performance) => {
  if (!performance.attempts) return false;
  
  const lastScores = performance.scores.slice(-2);
  const averageScore = lastScores.reduce((a, b) => a + b, 0) / lastScores.length;
  
  return performance.attempts >= PERFORMANCE_THRESHOLDS.REPEATED_FAILURE && 
         averageScore < PERFORMANCE_THRESHOLDS.STRUGGLING;
};

export const shouldShowChallenge = (moduleId) => {
  const finalAssessment = getFinalAssessment(moduleId);
  
  if (!finalAssessment.scores || finalAssessment.scores.length === 0) return false;
  
  // Challenge mode only shows if:
  // 1. First attempt at final assessment
  // 2. Passed with 75% or higher
  const firstScore = finalAssessment.scores[0];
  const isFirstAttempt = finalAssessment.attempts === 1;
  
  return isFirstAttempt && firstScore >= 75;
};

export const getDifficultyLevel = (performance) => {
  if (!performance.scores || performance.scores.length === 0) {
    return DIFFICULTY_LEVELS.NORMAL;
  }
  
  const averageScore = performance.scores.reduce((a, b) => a + b, 0) / performance.scores.length;
  const attempts = performance.attempts || 0;
  
  // Struggling learner
  if (attempts >= PERFORMANCE_THRESHOLDS.REPEATED_FAILURE && averageScore < PERFORMANCE_THRESHOLDS.STRUGGLING) {
    return DIFFICULTY_LEVELS.EASY;
  }
  
  // Quick mastery
  if (performance.scores[0] >= PERFORMANCE_THRESHOLDS.QUICK_MASTERY) {
    return DIFFICULTY_LEVELS.CHALLENGE;
  }
  
  return DIFFICULTY_LEVELS.NORMAL;
};

// Generate question variations (exclude correctly answered questions)
export const generateAssessmentQuestions = (allQuestions, performance) => {
  if (!performance.correctAnswers || performance.correctAnswers.length === 0) {
    return allQuestions;
  }
  
  // Filter out correctly answered questions and replace with variations
  return allQuestions.map((question, index) => {
    if (performance.correctAnswers.includes(index)) {
      // Return a variation of the question if available
      return question.variation || question;
    }
    return question;
  });
};

// Tutorial hints for struggling learners
export const getTutorialHints = (topicTitle, questionIndex) => {
  const hints = {
    'What is Computer Hardware Servicing?': [
      'Think about the main activities involved in maintaining a computer.',
      'Computer Hardware Servicing focuses on physical computer parts.',
      'Activities like coding are related to software, not hardware servicing.'
    ],
    'Importance of Computer Hardware Servicing': [
      'Consider what happens to physical components over time.',
      'Think about which benefit relates to saving money through prevention.',
      'Longevity means making something last longer.'
    ],
    'Trends Surrounding Computer Hardware Servicing': [
      'Remote servicing allows technicians to help from a distance.',
      'AI stands for Artificial Intelligence - systems that work automatically.',
      'Think about which technology creates self-operating systems.'
    ],
    'Understanding Workplace Hazards': [
      'Physical hazards involve things you can touch or see.',
      'Ergonomic hazards relate to body position and repetitive motions.',
      'Too many devices in one outlet is an electrical issue.'
    ]
  };
  
  return hints[topicTitle] ? hints[topicTitle][questionIndex] : null;
};

// Easier content variations for struggling learners
export const getEasierContent = (moduleId) => {
  const easierContent = {
    1: `Let's make this simple!

Computer Hardware Servicing (CHS) means taking care of computer parts. Just like you maintain your bike or car, computers need care too.

What does CHS include?
1. 🔧 Installing new parts (like adding a new wheel to your bike)
2. 🛠️ Fixing broken parts (like fixing a flat tire)
3. 🧹 Cleaning and maintaining (like oiling the chain)

Think of a computer technician as a computer doctor!

Key Points to Remember:
• CHS = Taking care of computer parts
• Install, Repair, Maintain
• Technicians are like computer doctors
• Computers need regular check-ups just like we do`,
    
    2: `Let's break down why CHS is important in simple terms:

Why is CHS Important?
1. 🚀 Performance - Makes computers run faster and smoother
2. 💰 Save Money - Fix small problems before they become big expensive problems
3. 📁 Protect Your Data - Keep your files and information safe
4. ⏰ Last Longer - Well-maintained computers last many years
5. 🔒 Stay Safe - Prevent fires and other dangers

Real Example:
Just like changing oil in a car keeps it running well, cleaning dust from a computer keeps it cool and prevents overheating!`,

    3: `Simple overview of CHS trends:

Modern CHS Trends (What's New):
1. 🌱 Green Computing - Saving energy and helping the environment
2. ☁️ Cloud Services - Storing files on the internet instead of your computer
3. 🔋 Mobile Devices - Phones and tablets need servicing too
4. 🤖 AI Tools - Smart programs help diagnose problems
5. 🔐 Security First - Keeping hackers out is super important

Bottom Line: Technology changes fast, and technicians need to keep learning!`,

    4: `Understanding workplace safety in simple terms:

Staying Safe While Working:
1. ⚡ Electricity Safety
   - Always unplug before opening computer
   - Don't touch wires with wet hands
   
2. 🧤 Protect Yourself
   - Wear anti-static wrist strap
   - Use proper tools
   
3. 🧹 Keep Workspace Clean
   - No food or drinks near computers
   - Keep area organized
   
4. 🚨 Know the Dangers
   - Sharp edges inside computers
   - Hot components can burn
   - Heavy parts can fall

Remember: Safety First, Always!`
  };
  
  return easierContent[moduleId] || '';
};

// Harder content variations for quick learners
export const getChallengeContent = (moduleId) => {
  const challengeContent = {
    1: `Now that you've mastered the basics, let's explore advanced concepts:

🏢 Enterprise-Level CHS:
• Data center management and redundancy planning
• Server rack assembly and hot-swapping techniques
• Disaster recovery procedures and business continuity
• SLA (Service Level Agreement) compliance and uptime guarantees
• Performance benchmarking and optimization strategies
• Multi-site infrastructure coordination

🔬 Advanced Diagnostic Techniques:
• Using POST codes for motherboard troubleshooting
• Oscilloscope readings for power supply analysis
• Thermal imaging for heat distribution mapping
• Advanced BIOS/UEFI configuration and overclocking safety
• Memory stress testing and validation
• Storage controller diagnostics

🎓 Professional Certifications to Consider:
• CompTIA A+ (foundational certification)
• CompTIA Server+ (server hardware specialist)
• Cisco CCNA (networking hardware and infrastructure)
• Microsoft Certified: Azure Administrator (cloud infrastructure)
• Dell EMC Certified Specialist (enterprise hardware)

💼 Real-World Scenario Challenge:
A financial institution's server room experiences a critical failure. The RAID array with 24 hard drives is degraded, and you have 2 hours before market opening. What are your systematic troubleshooting steps? Consider: fault isolation, hot spare activation, data integrity verification, and stakeholder communication.

Advanced Topics:
1. Liquid cooling systems maintenance
2. Blade server architecture
3. Power distribution unit (PDU) configuration
4. Environmental monitoring systems
5. Hardware security modules (HSM)`,

    2: `Advanced Understanding of CHS Importance:

📊 Business Impact Analysis:
• Total Cost of Ownership (TCO) calculations
• Return on Investment (ROI) for preventive maintenance
• Downtime cost analysis ($5,000-$9,000 per minute for large enterprises)
• Hardware lifecycle management strategies
• Warranty optimization and vendor negotiations

🔐 Advanced Data Protection:
• RAID configurations (0, 1, 5, 6, 10, 50) and use cases
• Hot backup vs. cold backup strategies
• Disk cloning and imaging best practices
• Data recovery from failed storage media
• Forensic data preservation techniques

⚡ Performance Optimization Deep Dive:
• Thermal management and cooling efficiency
• Power supply efficiency ratings (80 Plus Bronze/Silver/Gold/Platinum/Titanium)
• Component bottleneck identification
• Firmware updates and microcode patches
• Hardware telemetry and predictive maintenance

🌐 Industry Standards and Compliance:
• ISO 9001 quality management
• ITIL framework for IT service management
• OSHA workplace safety requirements
• ESD (Electrostatic Discharge) standards
• Environmental disposal regulations (WEEE, RoHS)

Challenge Question: Design a preventive maintenance schedule for a 500-workstation enterprise environment with mixed hardware generations.`,

    3: `Emerging Technologies and Future Trends:

🚀 Cutting-Edge Hardware Technologies:
• Quantum computing components and cooling requirements
• Neuromorphic chips and specialized AI accelerators
• Chiplet architecture and 3D stacking
• PCIe 5.0/6.0 bandwidth implications
• DDR5 and future memory technologies
• NVMe over Fabrics (NVMe-oF)

🌱 Advanced Green Computing:
• Carbon footprint calculation for IT infrastructure
• E-waste recycling and component recovery
• Energy Star certification requirements
• Dynamic voltage and frequency scaling (DVFS)
• Sustainable materials in hardware manufacturing
• Circular economy principles in IT

☁️ Edge Computing and IoT:
• Edge server deployment and maintenance
• Industrial IoT hardware servicing
• Environmental hardening for edge devices
• Remote diagnostics and management
• 5G infrastructure hardware requirements

🔒 Hardware Security:
• Trusted Platform Module (TPM) 2.0
• Secure Boot and firmware attestation
• Hardware encryption accelerators
• Supply chain security and component verification
• Side-channel attack mitigation
• Physical security mechanisms

🤖 AI-Assisted Diagnostics:
• Machine learning for predictive failure analysis
• Automated inventory management systems
• Computer vision for hardware inspection
• Natural language processing for technical documentation
• Digital twin technology for infrastructure simulation

Challenge: Research and present a proposal for implementing AI-driven predictive maintenance in a hospital's critical care equipment.`,

    4: `Advanced Occupational Health and Safety in CHS:

⚡ Electrical Safety - Professional Level:
• Understanding electrical codes (NEC, IEC)
• Lockout/Tagout (LOTO) procedures
• Arc flash hazard assessment
• Grounding and bonding verification
• Isolation transformer usage
• Voltage/current measurement safety protocols

🧪 Chemical and Material Hazards:
• Material Safety Data Sheets (MSDS/SDS) interpretation
• Thermal paste and compound handling
• Solder fume extraction requirements
• Battery chemistry (Li-ion, NiMH) hazards
• Cleaning solvent safety and disposal
• Refrigerant handling for liquid cooling systems

🏗️ Ergonomics and Repetitive Strain:
• Proper lifting techniques for heavy equipment (servers, UPS)
• Workstation setup for technician health
• Tool selection to minimize strain
• Cable management ergonomics
• Ladder and scaffold safety for rack work

🚨 Emergency Response Procedures:
• Fire suppression in server rooms (FM-200, Inergen)
• Electrical fire response (Class C)
• Chemical spill containment
• First aid for electrical shock
• Evacuation procedures for critical infrastructure

📋 Regulatory Compliance:
• OSHA 29 CFR 1910 Subpart S (Electrical)
• NFPA 70E (Electrical Safety in the Workplace)
• EPA regulations for electronic waste
• Industry-specific regulations (HIPAA for healthcare, PCI DSS for finance)

Risk Assessment Matrix: Develop a comprehensive risk assessment for a data center installation project, including electrical, mechanical, chemical, and ergonomic hazards.`
  };
  
  return challengeContent[moduleId] || '';
};

// Question variations for retakes (modified questions)
export const questionVariations = {
  1: {
    'What is Computer Hardware Servicing?': [
      {
        original: 'From the choices below, which does not belong to the workflow of Computer Hardware Servicing?',
        variation: {
          question: 'Which of the following tasks is NOT part of Computer Hardware Servicing?',
          options: ['Component Maintenance', 'Hardware Installation', 'Software Programming', 'Equipment Repair'],
          correctAnswer: 'Software Programming',
          hint: 'CHS focuses on physical parts, not programming.'
        }
      }
    ],
    'Importance of Computer Hardware Servicing': [
      {
        original: 'What is expected from computer hardware components as time goes by?',
        variation: {
          question: 'How do computer hardware components typically change over time?',
          options: [
            'They automatically upgrade themselves',
            'They need replacement parts added',
            'They experience wear and potential damage',
            'They become completely non-functional instantly'
          ],
          correctAnswer: 'They experience wear and potential damage',
          hint: 'Think about how physical objects age with use.'
        }
      },
      {
        original: 'Which importance of CHS highlights the potential to minimize the need for expensive resolutions?',
        variation: {
          question: 'Which benefit of CHS emphasizes preventing costly repairs through regular maintenance?',
          options: ['Economic Efficiency', 'Extended Lifespan', 'Information Security', 'System Speed'],
          correctAnswer: 'Economic Efficiency',
          hint: 'This is about saving money by being proactive.'
        }
      }
    ]
  },
  2: {
    'Understanding Workplace Hazards': [
      {
        original: 'Which of the following is considered a physical hazard in the workplace?',
        variation: {
          question: 'What type of workplace hazard involves physical contact or injury?',
          options: ['Loud equipment noise', 'Cables causing trips', 'Construction debris', 'Chemical exposure'],
          correctAnswer: 'Cables causing trips',
          hint: 'Think about hazards involving physical objects in your workspace.'
        }
      }
    ]
  }
};

export default {
  DIFFICULTY_LEVELS,
  PERFORMANCE_THRESHOLDS,
  trackPerformance,
  getPerformance,
  shouldShowHints,
  shouldShowChallenge,
  getDifficultyLevel,
  generateAssessmentQuestions,
  getTutorialHints,
  getEasierContent,
  getChallengeContent,
  questionVariations
};
