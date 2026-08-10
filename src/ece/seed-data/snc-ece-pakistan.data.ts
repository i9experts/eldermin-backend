// Pakistan's Single National Curriculum (SNC) for Early Childhood
// Education - a real, official government curriculum document (SNC-ECE,
// 2022), extracted and structured to match Eldermin's canonical
// developmental ontology (PRD §6): Domain -> Skill (Strand) -> Indicator
// (coded Student Learning Outcome), with real age-band differentiation
// (3-4 years / 4-5 years) where the curriculum itself distinguishes them.
//
// Official SLO codes are preserved in each indicator's text (e.g.
// "[ECE-00-A1-01]") for traceability back to the source document.
//
// One SLO (ECE-00-E2-07) was genuinely missing from the source PDF (a
// page-break extraction artifact) and was omitted rather than fabricated.

export interface SNCIndicatorSeed {
  text: string;
  ageBand: string | null;
}
export interface SNCSkillSeed {
  name: string;
  subDomainName: string;
  canonicalKey: string;
  indicators: SNCIndicatorSeed[];
}
export interface SNCDomainSeed {
  name: string;
  canonicalKey: string;
  skills: SNCSkillSeed[];
}

export const SNC_ECE_PAKISTAN: { domains: SNCDomainSeed[] } = {
  "domains": [
    {
      "name": "Personal, Social and Emotional Development",
      "canonicalKey": "sel",
      "skills": [
        {
          "name": "Awareness of Others (school, home , neighbourhood & living things)",
          "subDomainName": "A2",
          "canonicalKey": "sel.a2",
          "indicators": [
            {
              "text": "[ECE-00-A2-01] Demonstrate an awareness of the feelings of others (empathy).",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A2-01] Demonstrate an awareness and respect for the feelings of others (empathy).",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A2-02] Recognize and respect similarities and differences in others.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A2-02] Appreciate and respect similarities and differences in others.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A2-03] Recognize and be aware of the needs of the peers, elders, and neighbours who may be differently abled.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A2-03] Cooperate with and be aware of the needs of peers, elders, and neighbours who may be differently abled.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A2-04] Work cooperatively and share materials and Work in collaboration, in groups/project work ideas amicably in groups. to promote leadership skills. Cooperate with peers and engage in empathetic, caring behaviour and respond to others positively.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-A2-05] Use courtesy words (good morning, Assalam o Alaikum, thank you, sorry) as per context and language being taught).",
              "ageBand": null
            },
            {
              "text": "[ECE-00-A2-06] Suggest solutions to everyday problems. 26",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A2-06] Develop problem solving skills by identifying problems and ways to work collaboratively to resolve conflict.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Awareness of their own heritage, culture and religion.",
          "subDomainName": "A3",
          "canonicalKey": "sel.a3",
          "indicators": [
            {
              "text": "[ECE-00-A3-01] Talk about their culture i.e. the language they speak, the food they eat, clothes they wear and family traditions.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A3-01] Develop understanding about Pakistani culture. (i.e. know about the national game, flag, flower, food, folk dresses, languages etc.).",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A3-02] Recognise and respect people around them with diverse abilities, backgrounds and languages.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A3-02] Communicate appropriately and socialise with people with diverse abilities, backgrounds and languages.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A3-03] Muslim children will: Believe that Allah is the Sole Creator and Prophet Muhammad is His last and most beloved Prophet. Recognise Islam stands for peace and harmony. Recite the first Kalma. Recite small dua'as and know why they should be recited.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-A3-04] Name and identify key pillars of their own religion.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-A3-05] Demonstrate tolerance for all religions. 27",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A3-05] Language and Literacy",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Awareness of Self",
          "subDomainName": "A1",
          "canonicalKey": "sel.a1",
          "indicators": [
            {
              "text": "[ECE-00-A1-01] Recognize themselves and say their name and gender.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A1-01] Name their parents and siblings and state their address.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A1-02] Recognize their emotions (happy, scared, angry and sad).",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A1-02] Identify and express themselves verbally; when they feel happy, sad, scared, angry and excited.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A1-03] Demonstrate an understanding of their emotions.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A1-03] Choose and talk about an activity/work that they enjoy doing the most in class.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-A1-04] Recognize and talk about what they enjoy doing (e.g. tracing, colouring, running, jumping, hopping etc.)",
              "ageBand": null
            },
            {
              "text": "[ECE-00-A1-05] Identify and name their belongings.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-A1-05] Demonstrates the ability to look after own hygiene.",
              "ageBand": "4-5 years"
            }
          ]
        }
      ]
    },
    {
      "name": "Language and Literacy",
      "canonicalKey": "language",
      "skills": [
        {
          "name": "Receptive Language",
          "subDomainName": "B1",
          "canonicalKey": "language.b1",
          "indicators": [
            {
              "text": "[ECE-00-B1-01] Listen to stories and rhymes. 4-5 Years Listen and respond to stories, poems, and rhymes.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B1-02] Respond appropriately to questions, signs, stories and rhymes. 28",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B1-03] Respond to verbal and non-verbal gestures, symbols and signs.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B1-03] Respond to others in a variety of verbal and nonverbal ways for different purposes for example, exchanging ideas, expressing feelings, and a variety of contexts, plan-work-clean-up-review, group work time.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B1-04] Wait for their turn to speak and listen attentively to others.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B1-04] Wait for their turn to speak and listen attentively to others.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B1-05] Follow instructions that involve familiar experiences and objects.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B1-05] Follow increasingly longer and complex instructions, including sentences with two or more phrases or ideas.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Expressive Language",
          "subDomainName": "B2",
          "canonicalKey": "language.b2",
          "indicators": [
            {
              "text": "[ECE-00-B2-01] Communicate ideas and needs for example, Communicate ideas with clarity and talk about I need water, I am hungry or may I go to the pictures, stories, objects, events of interest etc. washroom etc.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B2-02] Recall and use new vocabulary (at least 100 Recall and use new vocabulary (at least 150 words) new words) in the language being taught. in the language being taught.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B2-03] Describe pictures, events, objects and people using appropriate vocabulary and simple sentences.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B2-03] Retell and respond to stories, songs and rhymes using extensive vocabulary.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B2-04] Talk about their experiences and feelings with peers and adults.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B2-04] Talk about their experiences and feelings with peers and adults using complete sentences.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B2-05] Raise and answer simple questions from stories/text read out to them.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B2-05] Raise and answer simple questions from stories/text read by them or to them.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Reading",
          "subDomainName": "B3a",
          "canonicalKey": "language.b3a",
          "indicators": [
            {
              "text": "[ECE-00-B3a-01] Explore the physical features of a book",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-01] Explore the physical features and components of a book (title, cover and back).",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3a-02] Hold, open and turn pages of a book with care.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-02] Recognize specific books by their cover and seek out specific pages within familiar books.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3a-03] Skim and scan through age-appropriate books.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-03] Skim and scan through age-appropriate books, read/recognise familiar words (sight words).",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3a-04] Recognise some books and the stories they tell.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-04] Differentiate between books that tell stories and those that give information.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3a-05] Retell a favourite story in their own words.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-05] Retell a favourite story in their own words in the correct sequence.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3a-06] Demonstrate reading-like behaviour, e.g. hold book right way up, run finger along text in the appropriate direction.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-06] Indicate the direction in which the language being taught is read by running their finger under the text in the correct direction i.e. for Urdu it is from right to left and top to bottom.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3a-07] Indicate the direction that English is read by running their finger under the text in the correct direction i.e. from left to right and top to bottom.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B3a-08] Identify and name the characters in a story.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-08] Identify the main events and characters in a story.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3a-09] Link what they read or hear read to their own real life experiences by sharing examples",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3a-09] Link what they read or hear read to their own real life experiences.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Reading (Phonological Awareness)",
          "subDomainName": "B3b",
          "canonicalKey": "language.b3b",
          "indicators": [
            {
              "text": "[ECE-00-B3b-01] Recognize the letters and their sounds.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3b-01] Recognise and name letters of the languages being taught (graphemes) and know the most common sound that each letter represents.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3b-02] Recognize sounds (phonemes) in the beginning, middle, and end of a word.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3b-02] Hear and relate a phoneme (in the initial, middle and end of a word) with the corresponding letter.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3b-03] 4-5",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3b-03] Identify and recognize the sound of digraphs within words.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3b-04] Identify objects/words which have the same sound in the beginning, middle and end.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3b-04] Read consonant-vowel-consonant (CVC) words using their knowledge of letters and sounds including onset and rime.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-B3b-05] Recognise and generate rhyming words, alliteration patterns.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B3b-06] Make phonetically plausible attempts when reading.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B3b-06] Make phonetically plausible attempts when reading. Blend sounds associated with letters when reading CVC words.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Writing",
          "subDomainName": "B4",
          "canonicalKey": "language.b4",
          "indicators": [
            {
              "text": "[ECE-00-B4-01] Trace lines and shapes with the first two fingers of the right hand (sand, salt, textured paper, air etc.).",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B4-02] Hold writing tools properly to develop a comfortable and efficient pencil grip and begin to draw horizontal and vertical lines.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B4-03] Colour a picture keeping within the designated space.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B4-04] Trace letters of the language/s being taught. Trace, copy and write the letters of the language/s being taught using correct formation.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-B4-08] Approximate Age: 3 - 4 Years",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-B4-08] Trace and draw vertical, horizontal and wavy lines and simple patterns made up of lines, circles, semi circles and other simple shapes with efficient pencil grip.",
              "ageBand": "4-5 years"
            }
          ]
        }
      ]
    },
    {
      "name": "Basic Mathematical Concepts",
      "canonicalKey": "math",
      "skills": [
        {
          "name": "Number Sense and Quantity",
          "subDomainName": "C1",
          "canonicalKey": "math.c1",
          "indicators": [
            {
              "text": "[ECE-00-C1-01] Count, identify and trace numbers up to 20. Count, identify and write numbers up to 50.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C1-02] Order and sequence numbers to 20. Order and sequence numbers 0-50",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C1-02] Count objects saying the number names in the standard order, pairing each object with one and",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C1-03] only one number name. 33",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C1-04] Differentiate between 'less' and 'more'.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C1-04] Compare less and more quantities and make them equal.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C1-05] Count backwards from 10-1. Count backwards from 20-1.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C1-06] Identify nothing equates to zero in quantity Take away objects from a set to represent zero.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C1-07] Count and make sets of up to 10 objects. Count and make sets of 5, 10 and 15 objects.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C1-08] Use ordinal numbers '1st', '2nd', and 3rd to indicate position in a sequence; e.g. I put the blue ball third.",
              "ageBand": null
            }
          ]
        },
        {
          "name": "Number Relationships and Operations",
          "subDomainName": "C2",
          "canonicalKey": "math.c2",
          "indicators": [
            {
              "text": "[ECE-00-C2-01] Compare two or more sets and identify the set which has more objects.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C2-01] 4-5 Years Count to compare two sets of objects to determine which set has more or less.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C2-03] Recognise that an entire set of objects is more than its parts.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C2-03] Solve addition and subtraction problems with totals smaller than ten using concrete materials.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C2-04] Add and subtract with sets of objects smaller than 3.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C2-05] Apply counting to their daily life activities. Identify the numeral which represents the number of objects in a set.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C2-06] Count at least ten objects with one-to-one correspondence.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C2-06] Identify the number that comes before or after a given number to 20.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C2-07] Identify the number that comes before or after a given number up to ten.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C2-07] Explain the difference between addition and subtraction.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Measurement, Comparison and Ordering",
          "subDomainName": "C3",
          "canonicalKey": "math.c3",
          "indicators": [
            {
              "text": "[ECE-00-C3-01] Use words such as 'more' and 'less' to indicate differences in quantity.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C3-02] Use language to compare the sizes of objects (e.g. 'big', 'little', 'small').",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C3-02] Use comparative language e.g. 'tall', 'taller' and 'tallest', 'short', 'shorter' and 'shortest'.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C3-04] Describe and compare objects using length; weight; height; and temperature (hot & cold) as measurement attributes",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C3-05] Differentiate between day and night, before and after.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C3-05] Sequence events in chronological order using language e.g. day and night, before and after, next, first, today, yesterday, tomorrow, morning, afternoon and evening.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C3-06] Recognise informal time units and know that clocks and calendars mark the passage of time. Respond appropriately to and use the",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C3-07] comparative and descriptive language of time of their local community e.g. before, now, after, day, night, summer, winter.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C3-07] Compare, describe and solve practical problems for measuring time e.g. quicker, slower, earlier, later.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C3-08] Recognise and use language relating to days of the week, months of the year. Domain C: Basic Mathematical Concepts",
              "ageBand": null
            }
          ]
        },
        {
          "name": "Geometry & Spatial Sense",
          "subDomainName": "C4",
          "canonicalKey": "math.c4",
          "indicators": [
            {
              "text": "[ECE-00-C4-01] Identify and name 2-D or familiar shapes e.g. circle, square, triangle, oval, rectangle etc.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C4-01] Recognise and name 2-D and 3-D shapes and objects such as sphere, cube, cuboid, cylinder and cone using features such as number of faces i.e. flat or curved.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-C4-02] Compare the shape and size of objects. Combine and take apart shapes to make other shapes.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C4-03] Order shapes from smallest to largest (e.g. orders various circle sizes).",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C4-04] Use language related to location / prepositions e.g. 'above', 'below', 'under', 'over' etc.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-C4-05] Recognise patterns in the environment. 36",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-C4-05] Create patterns using concrete materials.",
              "ageBand": "4-5 years"
            }
          ]
        }
      ]
    },
    {
      "name": "The World Around Us",
      "canonicalKey": "world_around_us",
      "skills": [
        {
          "name": "Me, My Family and My Community",
          "subDomainName": "D1",
          "canonicalKey": "world_around_us.d1",
          "indicators": [
            {
              "text": "[ECE-00-D1-01] Identify and name the following parts of the body: head, nose, tongue, shoulders, ears, eyes, arms, hands, fingers, legs, feet and toes.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D1-01] Observes similarities and differences in the physical appearance of family members.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D1-02] Identify themselves as members of a family or classroom and participate as active members of these communities.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D1-02] Talk about their family members and everyone's role and importance to the well-being of the family.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D1-03] Identify basic similarities and differences between themselves and others.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D1-03] Demonstrate an awareness of and appreciation for family and cultural stories.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D1-04] Adopt the roles of different family members Demonstrate an understanding about other during dramatic play. children having different family compositions than their own.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-05] Identify people by characteristics other than name, e.g. 'That man is good at fixing cars' etc.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D1-05] Recognise others' capabilities in specific areas.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D1-06] Recognise some community workers and Identify some types of jobs and some of the increase awareness of their jobs. tools used to perform those jobs.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-07] Demonstrate awareness of group rules (e.g. Exhibit positive citizenship behaviours i.e. waits for turn etc.). sharing, taking turns, following rules and taking responsibility for classroom jobs. 37",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-08] Exhibit personal responsibility, choice and leadership in context of self-help skills and duties/roles that benefit the family or class.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-09] Identify and name the Describe different smells; bad and good.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D1-09] Differentiate between smells; bad, good, strong, light, fruity, flowery and pungent.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D1-10] Describe different tastes; sweet, salty, sour. Differentiate between different tastes; sweet, salty, sour.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-11] Differentiate between different sounds; loud, soft, shrill.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-12] Identify and differentiate between temperatures and surfaces when touched such as hot, cold, soft, hard, rough, smooth etc.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-13] Identify different means of transport.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D1-14] Name the various parts of a car, bicycle and boat.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D1-14] Identify different modes of transport and the vehicles used for each mode.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Living and non-living things",
          "subDomainName": "D2",
          "canonicalKey": "world_around_us.d2",
          "indicators": [
            {
              "text": "[ECE-00-D2-01] Identify and name a few living and nonliving things.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D2-01] Classify living and non-living things",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D2-02] Differentiate between living and non-living things.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D2-03] Identify living and nonliving things in their surroundings.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D2-04] Approximate Age: 3-4 Years",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D2-04] Recognise that all living things have homes.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Plants in their environment",
          "subDomainName": "D3",
          "canonicalKey": "world_around_us.d3",
          "indicators": [
            {
              "text": "[ECE-00-D3-01] Observe plants in their locality and talk about the ones they like and dislike.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D3-01] Describe and differentiate between plants in their environment.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D3-02] Identify and name a few different types of local flowers.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D3-02] Identify and name a few different types of local flowers and trees.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D3-03] Observe and record the growth of a plant from a seed.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D3-04] Recognize that plants are living things and know that plants need sunlight, water and food to live.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D3-05] Identify how to take care of plants for example by growing a small seedling in a disposable glass.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D3-05] Talk about the significance of plants for human beings.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Animals in their environment",
          "subDomainName": "D4",
          "canonicalKey": "world_around_us.d4",
          "indicators": [
            {
              "text": "[ECE-00-D4-01] Recognize and name pet animals, farm animals and sea creatures.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D4-01] Identify and name a variety of common animals including fish, amphibians, reptiles, birds and mammals.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D4-02] Recognize and understand that animals are living things.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D4-02] Recognise that living things have different types of homes. Some live on land, some live in water and some live in nests.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D4-03] Recognise the importance of taking care of animals in their environment.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D4-03] Differentiate between living and non-living things.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Weather and Environment",
          "subDomainName": "D5",
          "canonicalKey": "world_around_us.d5",
          "indicators": [
            {
              "text": "[ECE-00-D5-01] Observe and explore daily weather conditions.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D5-01] Describe daily weather conditions.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D5-02] Explore and discuss different seasons, based on observations and experiences.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D5-02] Describe key features of different seasons, based on observations and experiences.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D5-03] Explore and discuss how the changing seasons affect our food, clothes and lifestyles.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D5-04] Name various landforms in their locality e.g. mountains, deserts, forests, sea, etc.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D5-04] Describe and differentiate between various landforms in their locality e.g. mountains, deserts, forests, seas, rivers, lakes etc.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D5-05] Explore and discuss practises that are harmful to the environment.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-D5-05] Examine the causes of air and land pollution and suggest preventive measures.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-D5-06] Identify the uses of water and how to conserve it.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D5-07] Identify how to prevent/reduce noise pollution.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D5-08] Explore alternate uses of waste material.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D5-09] Identify practises that are useful and harmful to the environment and suggest alternatives to harmful practises.",
              "ageBand": null
            }
          ]
        },
        {
          "name": "Technology",
          "subDomainName": "D6",
          "canonicalKey": "world_around_us.d6",
          "indicators": [
            {
              "text": "[ECE-00-D6-01] Name and explore different types of technology like television, computer, mobile phone, tablet etc.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D6-02] Use of different types of technology devices safely.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-D6-03] Identify the advantages and disadvantages of using technology. 43",
              "ageBand": null
            }
          ]
        }
      ]
    },
    {
      "name": "Health, Hygiene, and Safety",
      "canonicalKey": "health_safety",
      "skills": [
        {
          "name": "Health and hygiene",
          "subDomainName": "E1",
          "canonicalKey": "health_safety.e1",
          "indicators": [
            {
              "text": "[ECE-00-E1-01] Make healthy lifestyle choices independently (healthy foods and unhealthy foods, exercise, clean water etc.).",
              "ageBand": null
            },
            {
              "text": "[ECE-00-E1-02] Identify people who take care of health needs.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-E1-03] Wash hands at necessary times.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-E1-03] Practice healthy hygiene routines independently (brushing teeth, washing hands at necessary times, taking a bath, proper usage of the toilet, etc.)",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Safety",
          "subDomainName": "E2",
          "canonicalKey": "health_safety.e2",
          "indicators": [
            {
              "text": "[ECE-00-E2-01] Hold hands with an adult when walking in Recognise and alert an adult in situations where they public places. feel unsafe (they are injured, hurt, bullied, they dislike something, they are scared)",
              "ageBand": null
            },
            {
              "text": "[ECE-00-E2-02] Recognize and understand that certain parts of the body are private and only parents/doctors/caregivers can be allowed to touch them - 'good touch', 'bad touch'.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-E2-03] Say/shout 'NO' when someone tries to touch them inappropriately.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-E2-04] Recognise basic safety rules. Understand they should not: talk to, go with or take anything from strangers, open the house front door to strangers, go out alone, do not take medicines on their own, crossing a road safely with an adult etc.",
              "ageBand": null
            }
          ]
        }
      ]
    },
    {
      "name": "Creative Arts",
      "canonicalKey": "creative_arts",
      "skills": [
        {
          "name": "Drawing, Colouring & Collage Work",
          "subDomainName": "F1",
          "canonicalKey": "creative_arts.f1",
          "indicators": [
            {
              "text": "[ECE-00-F1-01] Hold drawing tools (crayons, colour, pencils Use various art techniques, such as, drawing, and paintbrush) with a safe and effective grip. colouring, collage or printing to create their craft work.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-F1-02] Use tools to cut and paste various materials.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F1-02] Explore a variety of paper art techniques like folding paper to make patterns, collages, printing.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-F1-03] Communicate favourite colours.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F1-03] Express preferences to different types of art, music, and drama.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-F1-04] Use a variety of lines, colours, shapes and textures to express ideas, thoughts, and feelings.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F1-04] Use a variety of lines, colours, shapes and textures to express ideas and thoughts.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-F1-05] Talk about their own works of art e.g. what the artworks are about etc.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F1-05] Describe their artistic process and discuss specific elements in their work that hold personal importance.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Art & Craft",
          "subDomainName": "F2",
          "canonicalKey": "creative_arts.f2",
          "indicators": [
            {
              "text": "[ECE-00-F2-01] Reuse discarded paper and plastic to create works of art.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F2-01] Identify how to reduce, reuse and recycle paper and plastic.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-F2-02] Create objects of their own choice using a variety of waste and indigenous materials collected from their immediate surroundings",
              "ageBand": null
            },
            {
              "text": "[ECE-00-F2-03] Create shapes and objects using malleable and modelling materials such as play dough and clay.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F2-03] Create various sculptures/models using clay, Papier-mâché and other available modelling materials.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Music",
          "subDomainName": "F3",
          "canonicalKey": "creative_arts.f3",
          "indicators": [
            {
              "text": "[ECE-00-F3-01] Respond with movement or expressions to different poems, songs, rhymes.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F3-01] Perform songs, rhymes, poems with others using movements, expressions and actions.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-F3-02] Sing a range of well-known nursery rhymes Recite poems, folk songs, national songs in chorus and songs. and solo.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-F3-03] Explore different sounds made by sound producing objects (like musical instruments).",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-F3-03] Experiment with and differentiate between different sound producing objects and their sounds.",
              "ageBand": "4-5 years"
            }
          ]
        },
        {
          "name": "Drama and Theatre",
          "subDomainName": "F4",
          "canonicalKey": "creative_arts.f4",
          "indicators": [
            {
              "text": "[ECE-00-F4-01] Imitate the actions/movements they Explore and enact a variety of roles around them (in observe around them (e.g. people, animals, stories, cartoons, & real life). various modes of transport).",
              "ageBand": null
            },
            {
              "text": "[ECE-00-F4-02] Re-enact stories, poems and folk tales individually, and in groups.",
              "ageBand": null
            }
          ]
        }
      ]
    },
    {
      "name": "Physical Development",
      "canonicalKey": "physical",
      "skills": [
        {
          "name": "Gross Motor Skills",
          "subDomainName": "G1",
          "canonicalKey": "physical.g1",
          "indicators": [
            {
              "text": "[ECE-00-G1-01] Throw a ball overhand.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G1-01] Throw a ball overhand at increasing distances.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G1-02] Travel around, under, over, along and through balancing and climbing equipment.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G1-02] Run, jump and hop to reach the finish line.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G1-03] Demonstrate holding themselves in fixed positions for a few seconds.",
              "ageBand": null
            },
            {
              "text": "[ECE-00-G1-04] Walk on line and maintain balance.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G1-04] Walk on a line while carrying one or two objects. e.g. flag, glass of water or a bean bag etc.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G1-05] Walk up and down stairs assisted, using alternating feet; may jump from bottom step, landing on both feet.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G1-05] Walk up and down stairs unassisted, using alternating feet; may jump from bottom step, landing on both feet confidently.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G1-06] Move around, under, over, along and through balancing and climbing equipment.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G1-06] Run, jump, climb, throw and hop when participating in games.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G1-07] Give other children space while playing.",
              "ageBand": null
            }
          ]
        },
        {
          "name": "Fine Motor Skills",
          "subDomainName": "G2",
          "canonicalKey": "physical.g2",
          "indicators": [
            {
              "text": "[ECE-00-G2-01] Use a range of child-appropriate tools with increasing control.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G2-01] Use a range of child-appropriate tools with confidence.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G2-02] Handle flexible/malleable materials safely with increasing control.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G2-02] Handle flexible/malleable materials safely with confidence.",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G2-03] Pick up small objects with fingers and try to manipulate small objects (fit small objects into a hole etc.).",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G2-03] Manipulate small objects with ease (string beads, transferring of material by using tong, spoon and fork etc.).",
              "ageBand": "4-5 years"
            },
            {
              "text": "[ECE-00-G2-04] Tear, fold and paste paper of various sizes and shapes.",
              "ageBand": "3-4 years"
            },
            {
              "text": "[ECE-00-G2-04] Tear, fold and paste paper of various sizes and shapes.",
              "ageBand": "4-5 years"
            }
          ]
        }
      ]
    }
  ]
};
