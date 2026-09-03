# -*- coding: utf-8 -*-
r"""The quantities a numeric answer has to contain, so the site can mark it.

A numeric question asks for two or three numbers and shows its working, so
marking cannot be string equality. The site pulls every number out of what you
typed and checks that each of these turns up, within half a percent. Order,
commas, units and any working you write alongside are all free.

Only the numbers the question actually asks for are listed -- not the ones that
appear in the model answer's arithmetic -- or writing the right answer without
restating the inputs would come out wrong.
"""

EXPECTED = {
    # ------------------------------------------------------------- exam 01
    "e01q42": [19],                       # receptive field
    "e01q43": [64, 262144],               # d_k, and |W^O|
    "e01q44": [128, 128, 192],            # Swin stage-2 tensor shape
    "e01q45": [64480],                    # Conv3d parameters
    "e01q46": [3000, 30, 100],            # batch-all, batch-hard, ratio
    # ------------------------------------------------------------- exam 02
    "e02q40": [49, 196, 16],              # encoder tokens, decoder tokens, factor
    "e02q41": [65536, 0.39],              # LoRA parameters, share of the matrix
    "e02q42": [14, 56, 4],                # weights, +grads+Adam, ratio
    "e02q43": [100, 50],                  # guided and unguided evaluations
    "e02q44": [92160000],                 # NeRF evaluations per frame
    # ------------------------------------------------------------- exam 03
    "e03q43": [112, 112, 64, 9472],       # output shape and parameters
    "e03q44": [235146],                   # MLP parameters
    "e03q45": [64, 2359296, 4718592],     # d_k, attention, feed-forward
    "e03q46": [9834496, 153664, 64],      # global pairs, windowed pairs, ratio
    "e03q47": [67, 8, 537],               # MB at 256^3, factor, MB at 512^3
    "e03q48": [2688, 32, 84],             # batch-all, batch-hard, ratio
    # ------------------------------------------------------------- exam 04
    "e04q43": [2, 16],                    # jump, receptive field
    "e04q44": [64, 153664, 9834496],      # windows, windowed pairs, global pairs
    "e04q45": [3, 5, 12],                 # components, rank(L), trace(L)
    "e04q46": [10, 32768],                # bits certified, N for 15 bits
    "e04q47": [16777216, 131072, 128],    # full, LoRA, compression
    "e04q48": [0.9, 0.729],               # alpha, alpha-bar_3
    # ------------------------------------------------------------- exam 05
    "e05q43": [64, 134217728, 16777216],  # d_k, projection term, attention term
    "e05q44": [11, 23, 12167],            # layers, side, active voxels
    "e05q45": [128, 107520, 840],         # batch, batch-all, ratio
    "e05q46": [50790912, 2049],           # weights, factor for a third modality
    "e05q47": [500, 2000],                # EWC penalty at 0.1 and at 0.2
    "e05q48": [398131200, 39.8],          # evaluations per frame, seconds
    # ------------------------------------------------------------- exam 06
    "e06q43": [1179648, 133376, 8.84],    # standard, separable, ratio
    "e06q44": [4096, 614, 18740508],      # tokens, masked, logits
    "e06q45": [184, 256],                 # octree bytes, dense grid bytes
    "e06q46": [0.177, 0.25],              # c_ij, and the self-coefficient
    "e06q47": [8.318, 12, 11.09, 16],     # nats and bits at K=4096 and 65536
    "e06q48": [0.5, -10, 15],             # the gamma=0.5 and gamma=4 vectors
    # ------------------------------------------------------------- exam 07
    # 3.22e9 would more often be written in scientific notation than in full,
    # and numbers are matched literally -- so only the two a student is certain
    # to write down are required here
    "e07q43": [33, 63],                   # last effective kernel, and R
    "e07q44": [4096, 64],                 # patches, and the ratio
    "e07q45": [0.731, 0.313],             # p and loss at s=1
    "e07q46": [0.83],                     # the vanishing-gradient threshold
    "e07q47": [14, 28, 56, 42],           # weights, Adam states, total, removed
    "e07q48": [0.817, 228],               # alpha-bar_10, and the step count
    # ------------------------------------------------------------- exam 08
    "e08q43": [3072, 36864],              # flattened input, and weights
    "e08q44": [64, 262144, 1048576],      # d_k, |W^O|, all four projections
    "e08q45": [512, 96, 256, 192, 128, 384],   # Swin stages 1, 2 and 3
    "e08q46": [53],                       # 3-hop receptive field, degree 4
    "e08q47": [128, 3, 124, 47616],       # B, positives, negatives, batch-all
    "e08q48": [0.607, 0.368, 0.223, 0.135, 0.394],  # transmittance, absorbed
    # ------------------------------------------------------------- exam 09
    "e09q43": [401920, 36928, 10.9],      # dense, conv, ratio
    "e09q44": [3136, 9834496],            # tokens, and query-key pairs
    "e09q45": [3411, 50541, 64],          # occupied at 32^3 and 128^3, growth
    "e09q46": [0.5, 1, 2],                # cosine, distance, maximum
    "e09q47": [8, 5.545, 65536],          # bits, nats, N for double
    "e09q48": [12, 0.36],                 # DDPM seconds, ODE seconds
    # ------------------------------------------------------------- exam 10
    "e10q43": [56, 256, 295168, 924844032],    # shape, parameters, MACs
    "e10q44": [197, 577, 8.58],           # sequence lengths, and the growth
    "e10q45": [4, 10, 22],                # after 1, 2 and 3 layers
    "e10q46": [128, 7, 120, 107520],      # B, positives, negatives, batch-all
    "e10q47": [6.93, 10, 1048576],        # nats when guessing, bits, N
    "e10q48": [61440000, 30.72, 2.56],    # evaluations, s/frame, hours
}
