// https://platform.openai.com/docs/guides/structured-outputs?lang=node.js
// https://platform.openai.com/playground/chat?lang=curl&preset=FAaQYVf65aF406jPvwn4K0F2
// src/openai/openai.service.ts

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { z } from 'zod';

// Define the DTO for the Landing Page structure using Zod
const LandingPageSchema = z.object({
    landing_page: z.object({
        hero_section: z.object({
            headline: z.string(),
            subheadline: z.string(),
            hero_image: z.string(),
            cta: z.string(),
            success_points: z.array(z.string())
        }),
        problem_agitation: z.object({
            title: z.string(),
            problems: z.array(z.string()),
            agitation: z.string()
        }),
        value_proposition: z.object({
            title: z.string(),
            clarity_and_direction: z.array(z.string())
        }),
        solution_overview: z.object({
            title: z.string(),
            introduction: z.string(),
            key_benefits: z.array(z.string())
        }),
        product_features: z.object({
            title: z.string(),
            features: z.array(z.object({
                icon: z.string(),
                description: z.string()
            })),
            supporting_images: z.array(z.string())
        }),
        social_proof: z.object({
            title: z.string(),
            testimonials: z.array(z.object({
                customer: z.string(),
                review: z.string(),
                rating: z.number()
            })),
            influencer_review: z.object({
                name: z.string(),
                quote: z.string(),
                video_url: z.string()
            }),
            featured_media: z.array(z.string())
        }),
        meet_the_guide: z.object({
            title: z.string(),
            introduction: z.string(),
            credentials: z.string(),
            image: z.string(),
            video: z.string()
        }),
        how_it_works: z.object({
            title: z.string(),
            steps: z.array(z.string()),
            cta: z.string()
        }),
        success_and_failure: z.object({
            success: z.string(),
            failure: z.string()
        }),
        pricing_offers: z.object({
            title: z.string(),
            pricing_table: z.array(z.object({
                model: z.string(),
                price: z.string()
            })),
            special_offer: z.string(),
            cta: z.string()
        }),
        faq_section: z.object({
            title: z.string(),
            faqs: z.array(z.object({
                question: z.string(),
                answer: z.string()
            }))
        }),
        final_cta: z.object({
            title: z.string(),
            cta_button: z.string(),
            trust_signals: z.array(z.string())
        }),
        footer: z.object({
            quick_links: z.array(z.string()),
            social_media: z.array(z.string()),
            contact_info: z.object({
                email: z.string(),
                phone: z.string()
            }),
            trust_badges: z.array(z.string())
        })
    })
});

// Updated Zod schema to reflect OpenAI's actual response format
const OpenAIResponseSchema = z.object({
    id: z.string(),
    object: z.string(),
    created: z.number(),
    model: z.string(),
    choices: z.array(
        z.object({
            index: z.number(),
            message: z.object({
                role: z.string(),
                content: z.string(),  // The content of the message you're interested in
            }),
            logprobs: z.null(),
            finish_reason: z.string(),
        })
    ),
    usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
    }),
    service_tier: z.string(),
    system_fingerprint: z.string(),
});

@Injectable()
export class OpenAIService {
    private async getLandingPageContentFromOpenAIWithRetry(retryCount = 0): Promise<any> {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        const model = "gpt-4o-mini-2024-07-18";  // Use the specific model you want to call
        const prompt = "Please generate a landing page for a business that helps people build their brand message with less effort, money, and time., using ai and automation starting from how branding message, how to make logo, automation using n8n, AI for creating social media copy, till website and automatic customer support and ai pot, and support all of the time and lifetime supscription in our zoom meeting and tips and tricks on how to save more time and effort";

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: "gpt-4o-mini-2024-07-18",
                    messages: [
                        { role: "system", content: "You are a professional copywriter creating a detailed landing page for a any type of business giving to you" },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.5,
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "landing_page_response",
                            schema: {
                                type: "object",
                                required: ["landing_page"],
                                properties: {
                                    landing_page: {
                                        type: "object",
                                        required: [
                                            "hero_section",
                                            "problem_agitation",
                                            "value_proposition",
                                            "solution_overview",
                                            "product_features",
                                            "social_proof",
                                            "meet_the_guide",
                                            "how_it_works",
                                            "success_and_failure",
                                            "pricing_offers",
                                            "faq_section",
                                            "final_cta",
                                            "footer"
                                        ],
                                        properties: {
                                            hero_section: {
                                                type: "object",
                                                required: ["headline", "subheadline", "hero_image", "cta", "success_points"],
                                                properties: {
                                                    headline: { type: "string" },
                                                    subheadline: { type: "string" },
                                                    hero_image: { type: "string" },
                                                    cta: { type: "string" },
                                                    success_points: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    }
                                                }
                                            },
                                            problem_agitation: {
                                                type: "object",
                                                required: ["title", "problems", "agitation"],
                                                properties: {
                                                    title: { type: "string" },
                                                    problems: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    },
                                                    agitation: { type: "string" }
                                                }
                                            },
                                            value_proposition: {
                                                type: "object",
                                                required: ["title", "clarity_and_direction"],
                                                properties: {
                                                    title: { type: "string" },
                                                    clarity_and_direction: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    }
                                                }
                                            },
                                            solution_overview: {
                                                type: "object",
                                                required: ["title", "introduction", "key_benefits"],
                                                properties: {
                                                    title: { type: "string" },
                                                    introduction: { type: "string" },
                                                    key_benefits: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    }
                                                }
                                            },
                                            product_features: {
                                                type: "object",
                                                required: ["title", "features", "supporting_images"],
                                                properties: {
                                                    title: { type: "string" },
                                                    features: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            required: ["icon", "description"],
                                                            properties: {
                                                                icon: { type: "string" },
                                                                description: { type: "string" }
                                                            }
                                                        }
                                                    },
                                                    supporting_images: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    }
                                                }
                                            },
                                            social_proof: {
                                                type: "object",
                                                required: ["title", "testimonials", "influencer_review", "featured_media"],
                                                properties: {
                                                    title: { type: "string" },
                                                    testimonials: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            required: ["customer", "review", "rating"],
                                                            properties: {
                                                                customer: { type: "string" },
                                                                review: { type: "string" },
                                                                rating: { type: "integer" }
                                                            }
                                                        }
                                                    },
                                                    influencer_review: {
                                                        type: "object",
                                                        required: ["name", "quote", "video_url"],
                                                        properties: {
                                                            name: { type: "string" },
                                                            quote: { type: "string" },
                                                            video_url: { type: "string" }
                                                        }
                                                    },
                                                    featured_media: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    }
                                                }
                                            },
                                            meet_the_guide: {
                                                type: "object",
                                                required: ["title", "introduction", "credentials", "image", "video"],
                                                properties: {
                                                    title: { type: "string" },
                                                    introduction: { type: "string" },
                                                    credentials: { type: "string" },
                                                    image: { type: "string" },
                                                    video: { type: "string" }
                                                }
                                            },
                                            how_it_works: {
                                                type: "object",
                                                required: ["title", "steps", "cta"],
                                                properties: {
                                                    title: { type: "string" },
                                                    steps: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    },
                                                    cta: { type: "string" }
                                                }
                                            },
                                            success_and_failure: {
                                                type: "object",
                                                required: ["success", "failure"],
                                                properties: {
                                                    success: { type: "string" },
                                                    failure: { type: "string" }
                                                }
                                            },
                                            pricing_offers: {
                                                type: "object",
                                                required: ["title", "pricing_table", "special_offer", "cta"],
                                                properties: {
                                                    title: { type: "string" },
                                                    pricing_table: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            required: ["model", "price"],
                                                            properties: {
                                                                model: { type: "string" },
                                                                price: { type: "string" }
                                                            }
                                                        }
                                                    },
                                                    special_offer: { type: "string" },
                                                    cta: { type: "string" }
                                                }
                                            },
                                            faq_section: {
                                                type: "object",
                                                required: ["title", "faqs"],
                                                properties: {
                                                    title: { type: "string" },
                                                    faqs: {
                                                        type: "array",
                                                        items: {
                                                            type: "object",
                                                            required: ["question", "answer"],
                                                            properties: {
                                                                question: { type: "string" },
                                                                answer: { type: "string" }
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            final_cta: {
                                                type: "object",
                                                required: ["title", "cta_button", "trust_signals"],
                                                properties: {
                                                    title: { type: "string" },
                                                    cta_button: { type: "string" },
                                                    trust_signals: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    }
                                                }
                                            },
                                            footer: {
                                                type: "object",
                                                required: ["quick_links", "social_media", "contact_info", "trust_badges"],
                                                properties: {
                                                    quick_links: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    },
                                                    social_media: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    },
                                                    contact_info: {
                                                        type: "object",
                                                        required: ["email", "phone"],
                                                        properties: {
                                                            email: { type: "string" },
                                                            phone: { type: "string" }
                                                        }
                                                    },
                                                    trust_badges: {
                                                        type: "array",
                                                        items: { type: "string" }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${openaiApiKey}`,
                    },
                }
            );


            // Log the raw response for debugging
            console.log('OpenAI Response:', response.data);

            // Parse and validate the response using Zod
            const result = OpenAIResponseSchema.safeParse(response.data);

            if (result.success) {
                const content = result.data.choices[0].message.content;
                try {
                    // Attempt to parse the content as JSON
                    const landingPage = JSON.parse(content);

                    // Validate the parsed landing page with Zod
                    const landingPageValidation = LandingPageSchema.safeParse(landingPage);
                    if (landingPageValidation.success) {
                        return landingPageValidation.data;  // Return the validated landing page object
                    } else {
                        console.error('Invalid landing page structure:', landingPageValidation.error);
                        throw new Error('Invalid landing page structure');
                    }
                } catch (parseError) {
                    // Handle error if content isn't valid JSON (e.g., it's markdown or plain text)
                    console.warn('Content is not valid JSON. Returning as plain text:', content);
                    return { content };  // Return the raw content as a fallback
                }
            } else {
                console.error('Invalid response format:', result.error);
                throw new Error('Invalid response format from OpenAI API');
            }
        } catch (error) {
            if (error.response && error.response.status === 429) {
                if (retryCount < 3) {
                    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                    console.log(`Rate limit hit, retrying in ${delay}ms...`);
                    await this.sleep(delay);
                    return this.getLandingPageContentFromOpenAIWithRetry(retryCount + 1);
                } else {
                    throw new Error('Rate limit exceeded, please try again later.');
                }
            } else {
                console.error('Error communicating with OpenAI:', error);
                throw new Error('Error fetching data from OpenAI');
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public method to get landing page content
    async getLandingPageContent(): Promise<any> {
        return this.getLandingPageContentFromOpenAIWithRetry();
    }
}
