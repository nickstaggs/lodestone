# Refactor LLM model usage

## Overview
Currently both the anthropic and open ai models are called via fetch instead of using their SDK's from npm. Also hugging face is used as an alternative but I want to simplify model usage so I want to remove all of the hugging face related functionality and replace it with the the ability to use either anthropic or openai model. Also currently all of the models are hard coded in different places I want to make this more dynamic and have this populated at run time via the SDKs and have a page that shows at start up so a user can select the model they would like and have an admin page that accesses the same so a user can switch models at any time. Model selection functionality on eval page is replaced with the new functionality.


## Core functionality
1. Model services implementations are switched out to use the SDKs without any change in functionality
2. A new page is created to select models that appears at start up and is accessible via a menu item
3. Hugging face related code is removed
4. Model selection on eval page uses new functionality


## User Interface Requirements

### Layout
- New page holds 2 lists of models one for each of Anthropic and OpenAI
- New button on main page to access new model selection page

### Text & Styling
- New page to hold models to select matches current styling and text

### Animations
- Fade-out/fade-in animation for page


## Technical Architecture

### Data Model
```typescript
export interface LLMModel {
    company: 'Anthropic' | 'OpenAI'
    model: string
}
// Update Session interface
export interface Session {
    // ... existing fields ...
    selectedModel: LLMModel;
}
```

### Components

1. **ModelList** - Container for displaying Models from a provider
   - Shows loading indicator
   - Handles display and animation of questions

2. **ModelCard** - Card for model that includes simplified name and other info
   - OnClick updates selected model in the session

3. **ModelSelectionPage** - Page to select an LLM 

## Interaction Flow

### Opening page

1. **Initial state:**
   - No model is selected
   
2. **When user selects a model:**
   - The model is set on the session and the page closes

### Model selection page from menu

1. **Initial state:**
   - Model for the session is selected
   
2. **When user selects a model:**
   - The model is set on the session

### Eval Page

1. **Initial state:**
   - Model for the session is selected
   
2. **When user selects a model:**
   - The model is set for the eval page


## Error Handling

1. **API Failures:**
   - First failure: retry after 3-second delay
   - Second failure: skip this trigger, wait for next natural trigger
   - No user-facing error messages for API failures

2. **Loading State:**
   - Only show loading indicator if response takes >300ms
   - This prevents flickering for quick responses

### Functional Testing
- Verify selection of model on opening page and model selection page set the model for the session
- Verify the model service uses the model set in the session and uses the correct service implementation based on the company


### Error Handling Testing
- Test retry behavior with simulated API failures
- Verify graceful fallback when API is unavailable

## Developer Implementation Notes

1. Start with the database model changes to update the `session` table
2. Update the anthropic and openai model services to use the SDKs
3. Remove the hugging face related functionality
4. Update the eval page to use the new model selection functionality
5. Search for any more hard coded references for model selection and replace them
6. Create the new model selection page
7. Wire the application to open to the model selection page
8. Create the new menu button for the model selection page and wire that up to open the model selection page

## Additional Considerations

- All animations and transitions should be smooth and subtle
- The feature should never interrupt the user's writing flow
- Consider accessibility for all interactive elements
