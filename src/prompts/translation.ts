/**
 * Translation workflow prompts
 * Contains all prompts used in the multi-step translation process
 */

// Helper type for prompts that need dynamic values
type PromptTemplate = (
  targetLanguage: string,
  sourceLanguage: string | undefined,
  sourceText?: string,
  previousTranslation?: string,
  externalReview?: string
) => string;

export const prompts = {
  system: (
    targetLanguage: string,
    sourceLanguage: string | undefined,
    customInstructions?: string,
    currentStep?: string
  ): string => {
    let systemPrompt = `You are an expert literary translator with deep fluency in ${targetLanguage}${
      sourceLanguage ? ` and ${sourceLanguage}` : ""
    }.
Your goal is to create a high-quality translation that preserves the original's tone, style, literary devices,
cultural nuances, and overall impact. You prioritize readability and naturalness in the target language while
staying faithful to the source text's meaning and intention${
      sourceLanguage
        ? ""
        : " (you may need to infer the source language from the text provided)"
    }.

CRITICAL: You must ALWAYS translate the COMPLETE text without omitting any content. Ensure your translations include EVERY part of the source text from beginning to end. If the text is lengthy, you must still translate it in its entirety.\n`;

    // Only include the relevant XML tags based on the current step
    if (currentStep) {
      systemPrompt += `For this step, place your response inside the following XML tag(s) for easy extraction:\n`;

      switch (currentStep) {
        case "initial_analysis":
          systemPrompt += `- <analysis>your analysis here</analysis>\n`;
          break;
        case "expression_exploration":
          systemPrompt += `- <expression_exploration>your exploration here</expression_exploration>\n`;
          break;
        case "cultural_discussion":
          systemPrompt += `- <cultural_discussion>your discussion here</cultural_discussion>\n`;
          break;
        case "title_options":
          systemPrompt += `- <title_options>your title suggestions here</title_options>\n`;
          break;
        case "first_translation":
          systemPrompt += `- <first_translation>your COMPLETE translation here</first_translation>\n`;
          break;
        case "self_critique":
          systemPrompt += `- <critique>your critique here</critique>\n`;
          systemPrompt += `- <improved_translation>your COMPLETE improved translation here</improved_translation>\n`;
          break;
        case "further_refinement":
          systemPrompt += `- <second_critique>your second critique here</second_critique>\n`;
          systemPrompt += `- <further_improved_translation>your COMPLETE further improved translation here</further_improved_translation>\n`;
          break;
        case "final_translation":
          systemPrompt += `- <final_translation>your COMPLETE final translation here</final_translation>\n`;
          break;
        case "external_review":
          systemPrompt += `- <external_review>your external review here</external_review>\n`;
          break;
        case "apply_feedback":
          systemPrompt += `- <refined_final_translation>your COMPLETE refined final translation here</refined_final_translation>\n`;
          break;
        default:
          // If step is not recognized, include all tags as before
          systemPrompt += `Always place your translations inside appropriate XML tags for easy extraction:
- Initial analysis: <analysis>your analysis here</analysis>
- Expression exploration: <expression_exploration>your exploration here</expression_exploration>
- Cultural discussion: <cultural_discussion>your discussion here</cultural_discussion>
- Title options: <title_options>your title suggestions here</title_options>
- First draft translation: <first_translation>your COMPLETE translation here</first_translation>
- Critique: <critique>your critique here</critique>
- Improved translation: <improved_translation>your COMPLETE improved translation here</improved_translation>
- Second critique: <second_critique>your second critique here</second_critique>
- Further improved translation: <further_improved_translation>your COMPLETE further improved translation here</further_improved_translation>
- Comprehensive review: <review>your comprehensive review here</review>
- Final translation: <final_translation>your COMPLETE final translation here</final_translation>
- External review: <external_review>your external review here</external_review>
- Refined final translation: <refined_final_translation>your COMPLETE refined final translation here</refined_final_translation>\n`;
      }
    } else {
      // If no specific step is provided, include all tags as before
      systemPrompt += `Always place your translations inside appropriate XML tags for easy extraction:
- Initial analysis: <analysis>your analysis here</analysis>
- Expression exploration: <expression_exploration>your exploration here</expression_exploration>
- Cultural discussion: <cultural_discussion>your discussion here</cultural_discussion>
- Title options: <title_options>your title suggestions here</title_options>
- First draft translation: <first_translation>your COMPLETE translation here</first_translation>
- Critique: <critique>your critique here</critique>
- Improved translation: <improved_translation>your COMPLETE improved translation here</improved_translation>
- Second critique: <second_critique>your second critique here</second_critique>
- Further improved translation: <further_improved_translation>your COMPLETE further improved translation here</further_improved_translation>
- Comprehensive review: <review>your comprehensive review here</review>
- Final translation: <final_translation>your COMPLETE final translation here</final_translation>
- External review: <external_review>your external review here</external_review>
- Refined final translation: <refined_final_translation>your COMPLETE refined final translation here</refined_final_translation>\n`;
    }

    systemPrompt += `Your tone should be conversational and thoughtful, as if you're discussing the translation process with a colleague.
Think deeply about cultural context, idiomatic expressions, and literary devices that would resonate with native
${targetLanguage} speakers.

Work through the translation step by step, maintaining the voice and essence of the original while making it
feel naturally written in ${targetLanguage}.

Your output length is unlocked so you can produce at least 30K tokens in your output if needed - ensure you NEVER truncate or omit any part of the text.`;

    if (customInstructions) {
      systemPrompt += `\n\nAdditional instructions for this translation:\n${customInstructions}`;
    }
    return systemPrompt;
  },

  initialAnalysis: ((
    sourceText: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): string => `I'd like your help translating a text into ${targetLanguage}${
    sourceLanguage ? ` from ${sourceLanguage}` : ""
  }.
Before we start, could you analyze what we'll need to preserve in terms of tone, style, meaning, and cultural nuances?

Here's the text to be translated:

<source_text>
${sourceText}
</source_text>

Please analyze this text thoughtfully. What are the key elements that make this text distinctive? What tone, voice,
argument structure, rhetorical devices, and cultural references should we be careful to preserve in translation?

NOTE: Do not translate the text yet. This is just an analysis step to understand the text's distinctive elements.

Remember to put your analysis in <analysis> tags.`) as PromptTemplate,

  expressionExploration: ((
    sourceText: string,
    targetLanguage: string
  ): string => `Now that we've analyzed the text, let's explore how we might express key elements in ${targetLanguage}.

Here's the original text for reference:

<source_text>
${sourceText}
</source_text>

Could you identify 5-10 key phrases, idioms, cultural references, or stylistic elements from this text that might be challenging to translate?

For each one, could you suggest how you might express it in ${targetLanguage} to preserve the intended meaning, tone, and effect?

NOTE: This is not a full translation yet - we're just exploring key expressions to understand how to approach them.

Please format your exploration within <expression_exploration> tags.`) as PromptTemplate,

  toneAndCulturalDiscussion: ((
    sourceText: string,
    targetLanguage: string
  ): string => `Let's discuss the cultural adaptation aspects of this translation.

Here's the original text again for reference:

<source_text>
${sourceText}
</source_text>

What cultural adaptations might be necessary for ${targetLanguage} readers? Are there any references, analogies, or concepts
that would need special consideration for the target audience?

How should we handle the overall tone and voice to ensure it resonates with ${targetLanguage} readers while staying faithful
to the original? Are there any cultural sensitivities to be aware of?

Remember, we're still not translating the full text yet - just discussing how we'll approach cultural elements.

Please put your discussion within <cultural_discussion> tags.`) as PromptTemplate,

  titleAndInspirationExploration: ((
    sourceText: string,
    targetLanguage: string
  ): string => `Let's now consider how to translate the title and any literary inspirations we might draw from to create a compelling translation.

Here's the original text for reference:

<source_text>
${sourceText}
</source_text>

1. How should we translate the title to capture its essence in ${targetLanguage}? Please provide a few options with your reasoning.

2. Are there any well-known ${targetLanguage} literary works, authors, or stylistic traditions that might provide inspiration for our approach?
   How might these influences help us create a translation that feels natural and resonant to native speakers?

Please share your thoughts within <title_options> tags.`) as PromptTemplate,

  firstTranslationAttempt: ((
    sourceText: string,
    targetLanguage: string
  ): string => `Now that we've analyzed the text and discussed key considerations, I'd like you to create a first draft translation into ${targetLanguage}.

Here is the source text:

<source_text>
${sourceText}
</source_text>

Based on our previous discussions about tone, style, cultural nuances, and specific expressions, please translate the COMPLETE text.
Aim to preserve the original's meaning, impact, and feeling while making it sound natural in ${targetLanguage}.

IMPORTANT: You must translate the ENTIRE text without omitting any paragraphs, sentences, or content. Ensure your translation is complete from beginning to end. If the text is lengthy, make sure you include everything.

Please place your complete translation within <first_translation> tags.`) as PromptTemplate,

  selfCritiqueAndRefinement: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string,
    previousTranslation?: string
  ): string => `Now that we have our first draft, I'd love for you to review it critically.
What do you think are the strengths and weaknesses of this translation?

Here is the original text for reference:

<source_text>
${sourceText}
</source_text>

And here is the first draft translation:

<previous_translation>
${previousTranslation}
</previous_translation>

Could you analyze aspects like:
- Sentence structure and flow
- Word choice and terminology
- How well cultural elements were adapted
- The preservation of the original's tone and voice
- Poetic quality and literary devices
- Overall readability and naturalness in ${targetLanguage}
- COMPLETENESS: Check if any sentences or paragraphs were omitted from the original text

After providing your critique, please offer an improved version of the translation that addresses
the issues you identified. Providing the complete improved translation allows for easier comparison and usability.

IMPORTANT: Ensure your improved translation includes EVERY part of the source text with nothing omitted. Double-check that no content is missing.

Please put your critique in <critique> tags and your complete improved translation in <improved_translation> tags.`) as PromptTemplate,

  furtherRefinement: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string,
    previousTranslation?: string
  ): string => `Let's take a fresh look at our translation with new eyes.

Here is the original text:

<source_text>
${sourceText}
</source_text>

And here is our current translation:

<previous_translation>
${previousTranslation}
</previous_translation>

I'd like you to review this translation again, but this time paying special attention to:

1. Naturalness: Does it flow as if it were originally written in ${targetLanguage}?
2. Fidelity: Does it capture the full meaning and nuance of the original?
3. Completeness: Is EVERY part of the source text included in the translation?
4. Impact: Does it have the same emotional and rhetorical effect as the original?
5. Consistency: Are terms, tone, and style consistent throughout?
6. Cultural resonance: Would it connect with native ${targetLanguage} speakers on a cultural level?

After your critique, please provide a further improved version that addresses any issues you find.

IMPORTANT: Verify that no content has been omitted. Your translation must include EVERY part of the original text from start to finish.

Please put your critique in <second_critique> tags and your improved translation in <further_improved_translation> tags.`) as PromptTemplate,

  finalTranslation: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string,
    previousTranslation?: string
  ): string => `Now it's time for our final comprehensive review and translation.

Here's the original text:

<source_text>
${sourceText}
</source_text>

And our current translation:

<previous_translation>
${previousTranslation}
</previous_translation>

Let's do one final pass to perfect this translation. Consider all the aspects we've discussed:
- Overall flow and readability
- Accuracy and fidelity to the original
- Cultural adaptation
- Natural expression in ${targetLanguage}
- Preservation of tone, style, and voice
- Literary quality
- COMPLETENESS: Ensure that EVERY part of the source text is translated

After your review, please provide what you consider to be the final, polished translation.

CRITICAL: Your final translation MUST include the ENTIRE source text with no omissions whatsoever. Double-check that you have translated everything completely from beginning to end.

Please put your final translation in <final_translation> tags.`) as PromptTemplate,

  externalReviewSystem: ((
    targetLanguage: string,
    sourceLanguage?: string
  ): string => `You are an expert literary translator and critic with deep fluency in ${targetLanguage}${
    sourceLanguage ? ` and ${sourceLanguage}` : ""
  }.
Your task is to critically review a translation ${
    sourceLanguage ? `from ${sourceLanguage} ` : ""
  }to ${targetLanguage}, providing detailed,
constructive feedback on how well it captures the essence, tone, and cultural nuances of the original text.
Please be candid but fair in your assessment.`) as PromptTemplate,

  externalReviewUser: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string,
    translation?: string
  ): string => `I'd like you to provide an external review of a translation ${
    sourceLanguage ? `from ${sourceLanguage} ` : ""
  }to ${targetLanguage}.

Here's the original text:

<source_text>
${sourceText}
</source_text>

And here's the translation:

<translated_text>
${translation}
</translated_text>

Could you critically evaluate how well this translation captures the essence, tone, and cultural nuances of the original?
Please consider aspects like:
- Accuracy and fidelity to the source
- Natural flow and readability in ${targetLanguage}
- Cultural adaptation and resonance
- Preservation of literary devices, metaphors, and style
- Overall effectiveness as a ${targetLanguage} text
- COMPLETENESS: Has the entire source text been translated? Or are there missing parts?

IMPORTANT: Please explicitly check if any paragraphs, sentences, or sections from the source text are missing in the translation. If you find any omissions, highlight them clearly at the beginning of your review.

Please format your review within <external_review> tags.`) as PromptTemplate,

  applyExternalFeedback: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string,
    translation?: string,
    externalReview?: string
  ): string => `We've received an external review of our translation. Let's use this feedback to create our final refined version.

Here's the original text:

<source_text>
${sourceText}
</source_text>

Our current translation:

<current_translation>
${translation}
</current_translation>

And the external review we received:

<external_review>
${externalReview}
</external_review>

Based on this feedback, please create a refined final version of the translation that addresses the reviewer's points
while maintaining the strengths of our current version.

Please apply your best judgment - incorporate suggestions that improve the translation, but feel free to respectfully
disagree with points that you believe would not enhance the final result.

Please provide your refined final translation within <refined_final_translation> tags.`) as PromptTemplate,
};

export type PromptKey = keyof typeof prompts;
