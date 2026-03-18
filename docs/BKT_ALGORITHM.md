# MODULEARN - Bayesian Knowledge Tracing (BKT) Algorithm

## Overview
Bayesian Knowledge Tracing is a user modeling approach used to estimate the probability that a student has mastered a particular skill or competency based on their learning interactions.

## Core Concepts

### Knowledge State
At any point in time, a student's knowledge of a competency is represented as a probability:
- **P(L)** = Probability that the student has learned/mastered the skill
- Values range from 0 (completely unknown) to 1 (fully mastered)

### The Four BKT Parameters

1. **P(L₀) - Initial Knowledge**
   - Probability that student knows the skill before any instruction
   - Typical value: 0.1 (10%)
   - Example: A student entering a Computer Hardware course might have 10% prior knowledge

2. **P(T) - Transition/Learning Rate**
   - Probability of transitioning from "not learned" to "learned" state
   - Typical value: 0.3 (30%)
   - Example: After each learning opportunity, there's a 30% chance the student masters the skill

3. **P(S) - Slip Probability**
   - Probability of answering incorrectly despite knowing the skill
   - Typical value: 0.1 (10%)
   - Example: Student knows how to identify a motherboard but makes a careless mistake

4. **P(G) - Guess Probability**
   - Probability of answering correctly without knowing the skill
   - Typical value: 0.25 (25% for 4-option multiple choice)
   - Example: Student doesn't know the answer but guesses correctly

### Mastery Threshold
- Default: 0.95 (95%)
- When P(L) ≥ 0.95, the student is considered to have mastered the competency

## BKT Algorithm Flow

```
1. Initialize: P(L₀) = initial knowledge probability

2. Student answers a question

3. Update knowledge state based on correctness:
   
   IF answer is CORRECT:
       P(L | correct) = [P(L) × (1 - P(S))] / 
                        [P(L) × (1 - P(S)) + (1 - P(L)) × P(G)]
   
   IF answer is INCORRECT:
       P(L | incorrect) = [P(L) × P(S)] / 
                          [P(L) × P(S) + (1 - P(L)) × (1 - P(G))]

4. Update for learning opportunity (after evidence):
   P(L_{n+1}) = P(L_n) + (1 - P(L_n)) × P(T)

5. Check mastery:
   IF P(L_{n+1}) ≥ mastery_threshold:
       Skill is MASTERED
   ELSE:
       Continue practice

6. Repeat for each question/interaction
```

## Mathematical Formulas

### Bayes' Rule Application

**Given a correct answer:**
```
P(L_n | correct) = P(correct | L_n) × P(L_n) / P(correct)

Where:
P(correct | L_n) = 1 - P(S)  (probability of correct if learned)
P(correct | ¬L_n) = P(G)     (probability of correct if not learned)
P(correct) = P(L_n) × (1-P(S)) + (1-P(L_n)) × P(G)

Simplified:
P(L_n | correct) = [P(L_n) × (1 - P(S))] / 
                   [P(L_n) × (1 - P(S)) + (1 - P(L_n)) × P(G)]
```

**Given an incorrect answer:**
```
P(L_n | incorrect) = [P(L_n) × P(S)] / 
                     [P(L_n) × P(S) + (1 - P(L_n)) × (1 - P(G))]
```

**Learning transition:**
```
P(L_{n+1}) = P(L_n) + (1 - P(L_n)) × P(T)
```

## Implementation Example (Pseudocode)

```javascript
class BKTEngine {
    constructor(pL0 = 0.1, pT = 0.3, pS = 0.1, pG = 0.25, threshold = 0.95) {
        this.pL0 = pL0;
        this.pT = pT;
        this.pS = pS;
        this.pG = pG;
        this.masteryThreshold = threshold;
    }

    // Initialize knowledge state for a student-competency pair
    initializeKnowledgeState(userId, competencyId) {
        return {
            userId: userId,
            competencyId: competencyId,
            pL: this.pL0,
            attemptsCount: 0,
            correctCount: 0,
            isMastered: false
        };
    }

    // Update knowledge state after a response
    updateKnowledgeState(currentPL, isCorrect) {
        let newPL;
        
        if (isCorrect) {
            // Update based on correct answer
            let numerator = currentPL * (1 - this.pS);
            let denominator = currentPL * (1 - this.pS) + (1 - currentPL) * this.pG;
            newPL = numerator / denominator;
        } else {
            // Update based on incorrect answer
            let numerator = currentPL * this.pS;
            let denominator = currentPL * this.pS + (1 - currentPL) * (1 - this.pG);
            newPL = numerator / denominator;
        }
        
        // Apply learning transition
        newPL = newPL + (1 - newPL) * this.pT;
        
        // Ensure bounds [0, 1]
        newPL = Math.max(0, Math.min(1, newPL));
        
        return newPL;
    }

    // Check if mastery achieved
    isMastered(pL) {
        return pL >= this.masteryThreshold;
    }

    // Calculate next recommended topic
    recommendNextTopic(knowledgeStates) {
        // Find unmastered competencies
        let unmastered = knowledgeStates.filter(ks => !ks.isMastered);
        
        if (unmastered.length === 0) {
            return null; // All mastered
        }
        
        // Sort by probability (lowest first - needs most practice)
        unmastered.sort((a, b) => a.pL - b.pL);
        
        return unmastered[0].competencyId;
    }
}
```

## Example Walkthrough

**Scenario:** Student learning "Identify Motherboard Components"

**Initial State:**
- P(L₀) = 0.1
- P(T) = 0.3
- P(S) = 0.1
- P(G) = 0.25

**Question 1: "What is the CPU socket?"**
- Student answers: CORRECT

```
Update:
P(L | correct) = [0.1 × (1-0.1)] / [0.1 × (1-0.1) + (1-0.1) × 0.25]
               = [0.1 × 0.9] / [0.09 + 0.225]
               = 0.09 / 0.315
               = 0.286

Apply learning:
P(L₁) = 0.286 + (1 - 0.286) × 0.3
      = 0.286 + 0.214
      = 0.500
```

**Question 2: "Identify the RAM slots"**
- Student answers: CORRECT

```
Update:
P(L | correct) = [0.5 × 0.9] / [0.5 × 0.9 + 0.5 × 0.25]
               = 0.45 / 0.575
               = 0.783

Apply learning:
P(L₂) = 0.783 + (1 - 0.783) × 0.3
      = 0.783 + 0.065
      = 0.848
```

**Question 3: "Where is the CMOS battery?"**
- Student answers: CORRECT

```
Update:
P(L | correct) = [0.848 × 0.9] / [0.848 × 0.9 + 0.152 × 0.25]
               = 0.763 / 0.801
               = 0.953

Apply learning:
P(L₃) = 0.953 + (1 - 0.953) × 0.3
      = 0.953 + 0.014
      = 0.967
```

**Result:** P(L₃) = 0.967 ≥ 0.95 → **MASTERED!**

## Adaptive Learning Path Logic

```python
def generateLearningPath(userId):
    # Get all competencies
    competencies = getAllCompetencies()
    
    knowledgeStates = []
    for competency in competencies:
        ks = getKnowledgeState(userId, competency.id)
        knowledgeStates.append(ks)
    
    # Separate mastered and unmastered
    mastered = [ks for ks in knowledgeStates if ks.isMastered]
    unmastered = [ks for ks in knowledgeStates if not ks.isMastered]
    
    # Sort unmastered by priority
    # Priority = (1 - P(L)) × difficulty_weight × prerequisite_factor
    for ks in unmastered:
        ks.priority = calculatePriority(ks)
    
    unmastered.sort(key=lambda x: x.priority, reverse=True)
    
    # Recommend top 3 topics
    recommendations = unmastered[:3]
    
    return {
        'masteredCount': len(mastered),
        'totalCount': len(competencies),
        'nextRecommendations': recommendations,
        'overallProgress': len(mastered) / len(competencies) * 100
    }
```

## Parameter Tuning

### Recommended Starting Values by Domain

| Domain | P(L₀) | P(T) | P(S) | P(G) |
|--------|-------|------|------|------|
| Basic Identification | 0.15 | 0.35 | 0.10 | 0.25 |
| Technical Skills | 0.05 | 0.25 | 0.15 | 0.20 |
| Problem Solving | 0.10 | 0.20 | 0.12 | 0.15 |
| Advanced Concepts | 0.03 | 0.20 | 0.10 | 0.10 |

### Adjustment Guidelines

- **High P(L₀):** Use when students likely have prior knowledge
- **High P(T):** Use for easily learnable skills
- **High P(S):** Use when careless errors are common
- **High P(G):** Adjust based on answer format (higher for fewer options)

## Benefits for MODULEARN

1. **Personalized Learning Paths**
   - Skip mastered content
   - Focus on weak areas
   - Optimal difficulty progression

2. **Real-time Adaptation**
   - Immediate knowledge state updates
   - Dynamic content recommendations
   - Responsive to student performance

3. **Progress Tracking**
   - Quantifiable mastery levels
   - Historical knowledge trends
   - Predictive analytics

4. **Efficient Learning**
   - Reduced time to mastery
   - Minimized frustration
   - Increased engagement

## References

- Corbett, A. T., & Anderson, J. R. (1994). Knowledge tracing: Modeling the acquisition of procedural knowledge.
- Baker, R. S., Corbett, A. T., & Aleven, V. (2008). More accurate student modeling through contextual estimation of slip and guess probabilities.
- Pardos, Z. A., & Heffernan, N. T. (2010). Modeling individualization in a bayesian networks implementation of knowledge tracing.

## Implementation Files

The BKT algorithm will be implemented in:
- `backend/utils/bktAlgorithm.js` (Node.js version)
- `backend/controllers/bktController.js` (API endpoints)
- Database tables: `bkt_parameters`, `knowledge_states`
