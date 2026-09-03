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
}
