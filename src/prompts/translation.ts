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
    customInstructions?: string
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

Always place your translations inside appropriate XML tags for easy extraction:
- Initial analysis: <analysis>your analysis here</analysis>
- Expression exploration: <expression_exploration>your exploration here</expression_exploration>
- Cultural discussion: <cultural_discussion>your discussion here</cultural_discussion>
- Title options: <title_options>your title suggestions here</title_options>
- First draft translation: <first_translation>your translation here</first_translation>
- Critique: <critique>your critique here</critique>
- Improved translation: <improved_translation>your improved translation here</improved_translation>
- Second critique: <second_critique>your second critique here</second_critique>
- Further improved translation: <further_improved_translation>your further improved translation here</further_improved_translation>
- Comprehensive review: <review>your comprehensive review here</review>
- Final translation: <final_translation>your final translation here</final_translation>
- External review: <external_review>your external review here</external_review>
- Refined final translation: <refined_final_translation>your refined final translation here</refined_final_translation>

Your tone should be conversational and thoughtful, as if you're discussing the translation process with a colleague.
Think deeply about cultural context, idiomatic expressions, and literary devices that would resonate with native
${targetLanguage} speakers.

Work through the translation step by step, maintaining the voice and essence of the original while making it
feel naturally written in ${targetLanguage}.

Your output length is unlocked so you can do at least 10K tokens in the output.`;

    if (customInstructions) {
      systemPrompt += `\n\nAdditional instructions for this translation:\n${customInstructions}`;
    }
    return systemPrompt;
  },

  initialAnalysis: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string
  ): string => `I'd like your help translating a text into ${targetLanguage}${
    sourceLanguage ? ` from ${sourceLanguage}` : ""
  }.
Before we start, could you analyze what we'll need to preserve in terms of tone, style, meaning, and cultural nuances?

Here's the text:

${sourceText}

Please analyze this text thoughtfully. What are the key elements that make this text distinctive? What tone, voice,
argument structure, rhetorical devices, and cultural references should we be careful to preserve in translation?

Remember to put your analysis in <analysis> tags.`) as PromptTemplate,

  expressionExploration: ((
    targetLanguage: string,
    sourceLanguage: string | undefined
  ): string => `Now that we've analyzed the text, I'm curious about how we could express these elements in ${targetLanguage}${
    sourceLanguage ? ` (considering it's from ${sourceLanguage})` : ""
  }.

How might we capture the tone and style of the original in ${targetLanguage}? Are there particular expressions,
idioms, or literary devices in ${targetLanguage} that could help convey the same feeling and impact?

What about cultural references or metaphors? Could you suggest some ways to handle those elements that would resonate
with ${targetLanguage} speakers while staying true to the original's intent?

I'd love some specific examples or suggestions that we could use in our translation. Please include your thoughts
in <expression_exploration> tags.`) as PromptTemplate,

  toneAndCulturalDiscussion: ((
    targetLanguage: string,
    sourceLanguage: string | undefined
  ): string => `Let's discuss some specific aspects of our translation approach for translating into ${targetLanguage}${
    sourceLanguage ? ` from ${sourceLanguage}` : ""
  }:

What do you think would be the most appropriate tone or level of honorifics to use in this ${targetLanguage} translation?
I understand there might be cultural differences to consider. What would feel most natural and appropriate given the content and style of the original?

Are there any cultural references or allegories in ${targetLanguage} that might help convey the essence of certain passages,
even if they slightly modify the literal meaning? I'm fine with creative adaptation as long as the core message is preserved.

How can we ensure the translation maintains a distinctive personal voice, rather than sounding generic?
What would you say is unique about the original's voice, and how could we capture that in ${targetLanguage}?

Please share your thoughts in <cultural_discussion> tags.`) as PromptTemplate,

  titleAndInspirationExploration: ((
    targetLanguage: string,
    sourceLanguage: string | undefined
  ): string => `Let's talk about a few more aspects before we start the actual translation into ${targetLanguage}${
    sourceLanguage ? ` from ${sourceLanguage}` : ""
  }:

What might be a good way to translate the title into ${targetLanguage}? Could you suggest a few options
that would capture the essence and appeal while being culturally appropriate?

Are there any ${targetLanguage} writers or texts with a similar style or thematic focus that might
serve as inspiration for our translation approach? I'd find it helpful to know if this reminds you of particular writers or works.

What common pitfalls should we be careful to avoid when translating this type of content from ${sourceLanguage}
to ${targetLanguage}? Any particular challenges or mistakes that translators often make?

Please share your thoughts in <title_options> tags.`) as PromptTemplate,

  firstTranslationAttempt: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string
  ): string => `I think we're ready to start translating! Based on our discussions so far, could you create
a first draft translation of the text into ${targetLanguage}${
    sourceLanguage ? ` (from the original ${sourceLanguage})` : ""
  }?

Here's the original text again for reference:

${sourceText}

Please apply all the insights we've discussed about tone, style, cultural adaptation, and voice.
Please ensure the entire text is translated in this draft to facilitate review and usability.
Remember to put your translation in <first_translation> tags.`) as PromptTemplate,

  selfCritiqueAndRefinement: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string, // Not used, but keep signature consistent for simplicity
    previousTranslation?: string
  ): string => `Now that we have our first draft, I'd love for you to review it critically.
What do you think are the strengths and weaknesses of this translation?

Could you analyze aspects like:
- Sentence structure and flow
- Word choice and terminology
- How well cultural elements were adapted
- The preservation of the original's tone and voice
- Poetic quality and literary devices
- Overall readability and naturalness in ${targetLanguage}

After providing your critique, please offer an improved version of the translation that addresses
the issues you identified. Providing the complete improved translation allows for easier comparison and usability.

Here is the translation to critique and improve:

${previousTranslation}

Please put your critique in <critique> tags and your complete improved translation in <improved_translation> tags.`) as PromptTemplate,

  furtherRefinement: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string, // Not used
    previousTranslation?: string
  ): string => `As you mentioned before, the best way to write is often through critique and rewrite.
With fresh eyes, could you take another look at our current translation?

What aspects still need improvement? Are there places where the language could be more natural,
the cultural adaptation more nuanced, or the translation more faithful to the original's spirit?

I find that each revision helps us discover new things and see the text from different angles.
Your insights on what could still be enhanced would be invaluable.

After your critique, please provide another refined version of the translation that incorporates
these new insights and improvements. Please provide the complete refined translation for review.

Here is the translation to critique and improve:

${previousTranslation}

Please put your second critique in <second_critique> tags and your complete further improved translation
in <further_improved_translation> tags.`) as PromptTemplate,

  finalTranslation: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string, // Not used
    previousTranslation?: string
  ): string => `We've gone through several rounds of refinement, and I'm very happy with how the translation has evolved.
As a final step, I'd like you to provide:

1. A comprehensive review of the translation process, including:
   - A thoughtful comparison between the original ${sourceLanguage} text and our ${targetLanguage} translation
   - An analysis of the translation as a standalone piece of ${targetLanguage} writing
   - Reflections on how well we preserved the key elements we identified at the beginning

2. A final, polished version of the translation that represents your best work, incorporating all our discussions
and refinements throughout this process.

This final version should be something we can be proud of - a translation that's faithful to the original while
also reading naturally and beautifully in ${targetLanguage}. Please provide the entire final translation.

Here is the translation to review and finalize:

${previousTranslation}

Please put your review in <review> tags and your complete final translation in <final_translation> tags.`) as PromptTemplate,

  externalReviewSystem: (
    targetLanguage: string,
    sourceLanguage: string | undefined
  ): string => `You are an expert literary translator and critic with deep fluency in ${targetLanguage}${
    sourceLanguage ? ` and ${sourceLanguage}` : ""
  }.
Your task is to critically review a translation ${
    sourceLanguage ? `from ${sourceLanguage} ` : ""
  }to ${targetLanguage}, providing detailed,
constructive feedback on how well it captures the essence, tone, and cultural nuances of the original text.
Please be candid but fair in your assessment.`,

  externalReviewUser: ((
    targetLanguage: string,
    sourceLanguage: string | undefined,
    sourceText?: string,
    previousTranslation?: string // Renamed from finalTranslation for clarity
  ): string => `<Original>
${sourceText}
</Original>

<Translation>
${previousTranslation}
</Translation>

Here is an original ${sourceLanguage} article and a ${targetLanguage} translation. Compare and critique the translation in terms of how well it captures the soul of the original and the dialectic, but also how it stands alone as a piece of writing. Provide actionable feedback, with possible inspiration from good ${targetLanguage} writers or pieces.

Please format your response in <external_review> tags.`) as PromptTemplate,

  applyExternalFeedback: ((
    targetLanguage: string, // Not used directly in template, but good for signature
    sourceLanguage: string | undefined, // Not used
    sourceText?: string, // Not used
    previousTranslation?: string,
    externalReview?: string
  ): string => `We received an external review of our translation. Here it is:

${externalReview}

Based on this feedback, please create a final, refined version of the translation that addresses
the points raised in the review. This will be our absolute final version. Please provide the complete translation.

Here's the current translation for reference:

${previousTranslation}

Please put your refined translation in <refined_final_translation> tags.`) as PromptTemplate,
};

export type PromptKey = keyof typeof prompts;
