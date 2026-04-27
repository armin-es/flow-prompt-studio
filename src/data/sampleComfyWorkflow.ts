import type { ComfyWorkflow } from '../types'

/** Default demo workflow: simulated ComfyUI diffusion graph (no real GPU). */
export const SAMPLE_COMFY_WORKFLOW: ComfyWorkflow = {
  nodes: [
    {
      id: 1, type: 'CheckpointLoaderSimple', pos: [50, 80],
      size: [220, 98], inputs: [],
      outputs: [
        { name: 'MODEL', type: 'MODEL', links: [1] },
        { name: 'CLIP', type: 'CLIP', links: [3, 5] },
        { name: 'VAE', type: 'VAE', links: [8] },
      ],
      widgets_values: ['v1-5-pruned-emaonly.ckpt'],
    },
    {
      id: 2, type: 'CLIPTextEncode', pos: [340, 50],
      size: [220, 80], inputs: [{ name: 'clip', type: 'CLIP', link: 3 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [4] }],
      widgets_values: ['a beautiful landscape, masterpiece'],
    },
    {
      id: 3, type: 'CLIPTextEncode', pos: [340, 170],
      size: [220, 80], inputs: [{ name: 'clip', type: 'CLIP', link: 5 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [6] }],
      widgets_values: ['ugly, blurry, low quality'],
    },
    {
      id: 4, type: 'KSampler', pos: [620, 100],
      size: [280, 190],
      inputs: [
        { name: 'model', type: 'MODEL', link: 1 },
        { name: 'positive', type: 'CONDITIONING', link: 4 },
        { name: 'negative', type: 'CONDITIONING', link: 6 },
        { name: 'latent_image', type: 'LATENT', link: 2 },
      ],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [7] }],
      widgets_values: [42, 'euler', 'karras', 7, 20, 1],
    },
    {
      id: 5, type: 'EmptyLatentImage', pos: [340, 310],
      size: [200, 100], inputs: [],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [2] }],
      widgets_values: [512, 512, 1],
    },
    {
      id: 6, type: 'VAEDecode', pos: [960, 130],
      size: [200, 80],
      inputs: [
        { name: 'samples', type: 'LATENT', link: 7 },
        { name: 'vae', type: 'VAE', link: 8 },
      ],
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [9] }],
    },
    {
      id: 7, type: 'SaveImage', pos: [1220, 130],
      size: [200, 80],
      inputs: [{ name: 'images', type: 'IMAGE', link: 9 }],
      outputs: [],
      widgets_values: ['ComfyUI'],
    },
  ],
  links: [
    { 0: 1, 1: 1, 2: 0, 3: 4, 4: 0, 5: 'MODEL' },
    { 0: 2, 1: 5, 2: 0, 3: 4, 4: 3, 5: 'LATENT' },
    { 0: 3, 1: 1, 2: 1, 3: 2, 4: 0, 5: 'CLIP' },
    { 0: 4, 1: 2, 2: 0, 3: 4, 4: 1, 5: 'CONDITIONING' },
    { 0: 5, 1: 1, 2: 1, 3: 3, 4: 0, 5: 'CLIP' },
    { 0: 6, 1: 3, 2: 0, 3: 4, 4: 2, 5: 'CONDITIONING' },
    { 0: 7, 1: 4, 2: 0, 3: 6, 4: 0, 5: 'LATENT' },
    { 0: 8, 1: 1, 2: 2, 3: 6, 4: 1, 5: 'VAE' },
    { 0: 9, 1: 6, 2: 0, 3: 7, 4: 0, 5: 'IMAGE' },
  ],
}
