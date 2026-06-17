const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma3:4b';

// Base system prompt from MASTER DSA TUTOR AI PROMPT
const BASE_SYSTEM_PROMPT = `Act as a World-Class Data Structures & Algorithms Instructor, Competitive Programming Coach, Software Engineering Interview Mentor, and Problem Solving Expert with 20+ years of experience teaching students from beginner to FAANG-level interviews.

Your primary goal is NOT just to solve problems.
Your goal is to teach users how to think, analyze, optimize, and solve Data Structures and Algorithms problems independently.

# Core Responsibilities
When a user provides a DSA question, coding problem, interview question, LeetCode problem, HackerRank problem, Codeforces problem, or custom algorithmic challenge, you must:
1. Understand the problem completely.
2. Explain the problem in simple language.
3. Identify underlying patterns.
4. Explain intuition before code.
5. Discuss brute force solutions.
6. Derive optimized solutions step by step.
7. Explain time and space complexity.
8. Provide clean implementation.
9. Suggest interview discussion points.
10. Teach transferable problem-solving techniques.

# Teaching Methodology
Always follow this structure:
## Step 1: Problem Understanding
Explain what is being asked, inputs, outputs, constraints, and hidden observations using simple examples.

## Step 2: Visual Explanation
Visualize the problem using text-based diagrams for arrays, trees, graphs, maps, stacks, etc.

## Step 3: Pattern Recognition
Identify which pattern (e.g. Two Pointers, Sliding Window, DP, BFS, DFS, etc.) the problem belongs to and explain why.

## Step 4: Brute Force Approach
Explain the initial naive solution, why it works, why it is inefficient, and its complexity.

## Step 5: Optimization Process
Teach optimization gradually (Brute Force -> Better -> Optimal). Show every improvement.

## Step 6: Optimal Solution
Provide intuition, algorithm, pseudocode, and complete implementation.

## Step 7: Dry Run
Perform a complete dry run using sample input. Show variable values and state transitions.

## Step 8: Complexity Analysis
Provide best, average, and worst-case Time Complexity, and Space Complexity with brief explanations.

## Step 9: Interview Perspective
Explain common mistakes, edge cases, follow-up questions, and interviewer expectations.

## Step 10: Learning Outcome
Summarize key concepts, reusable tricks, and similar problem categories.

# Output Rules
Always provide all 10 steps. Never provide only code. Always prioritize learning over solving.`;

// Endpoint to check local Ollama status and model availability
app.get('/api/status', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout for local check

    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.json({ online: false, modelExists: false, error: 'Ollama returned error status.' });
    }

    const data = await response.json();
    const models = data.models || [];
    const modelExists = models.some(m => m.name === DEFAULT_MODEL || m.name.startsWith(DEFAULT_MODEL + ':'));

    return res.json({
      online: true,
      modelExists,
      availableModels: models.map(m => m.name)
    });
  } catch (error) {
    return res.json({
      online: false,
      modelExists: false,
      error: 'Could not connect to local Ollama. Ensure Ollama is running.'
    });
  }
});

// Endpoint to handle streaming chats
app.post('/api/chat', async (req, res) => {
  const { messages, settings } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  // Construct customized system prompt based on user settings
  let systemPrompt = BASE_SYSTEM_PROMPT;
  
  if (settings) {
    const { language, difficulty, competitive, dp, graph, binarySearch } = settings;
    
    systemPrompt += `\n\n# User Configuration Settings:`;
    
    if (language) {
      systemPrompt += `\n- **Preferred Programming Language**: ${language}. Code implementation must be written in ${language}.`;
    }
    
    if (difficulty) {
      systemPrompt += `\n- **Difficulty Adaptation Mode**: ${difficulty}.`;
      if (difficulty === 'Beginner') {
        systemPrompt += ` Focus heavily on intuition, provide multiple visual examples/diagrams, and explain basic concepts simply.`;
      } else if (difficulty === 'Advanced') {
        systemPrompt += ` Focus heavily on advanced patterns, mathematical reasoning, edge cases, and optimization details.`;
      } else {
        systemPrompt += ` Balance intuitive explanation and optimization detail equally.`;
      }
    }
    
    if (competitive) {
      systemPrompt += `\n- **Competitive Programming Mode**: Active. Consider fast I/O, strict constraint analysis, and optimization/mathematical shortcuts.`;
    }
    
    if (dp) {
      systemPrompt += `\n- **Dynamic Programming Mode**: Active. For DP problems, explicitly detail: 1. State definition, 2. Recurrence relation, 3. Base cases, 4. Memoization, 5. Tabulation, 6. Space optimization.`;
    }
    
    if (graph) {
      systemPrompt += `\n- **Graph Problem Mode**: Active. For graph problems, explicitly explain: 1. Representation, 2. Traversal strategy, 3. Why BFS vs DFS, 4. Complexity.`;
    }
    
    if (binarySearch) {
      systemPrompt += `\n- **Binary Search Mode**: Active. Detail: 1. Search space, 2. Monotonic property, 3. Validity function, 4. Binary search template.`;
    }
  }

  // Prepend system prompt to history
  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const modelToUse = (settings && settings.model) || DEFAULT_MODEL;

  try {
    const ollamaResponse = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelToUse,
        messages: formattedMessages,
        stream: true
      })
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      return res.status(ollamaResponse.status).json({ error: `Ollama error: ${errorText}` });
    }

    // Set headers for streaming SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = ollamaResponse.body.getReader();
    const decoder = new TextDecoder();

    // Check if client disconnects to abort the stream
    req.on('close', () => {
      reader.cancel();
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    
    res.end();
  } catch (error) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error while processing chat stream.' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Master DSA Tutor app listening at http://localhost:${PORT}`);
});
