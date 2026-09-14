# -*- coding: utf-8 -*-
r"""What each numeric question asks for: one (label, value) pair per quantity.

Viktor: "when the question asks for 3 numbers then we should have 3 number
fields not just one, or at least tell me how to input the 3 numbers into one
field." So the site now renders one labelled box per quantity, and the label
here is what it says. Writing them out also caught eight questions whose
expected list was shorter than what the question actually asked for -- with a
single free-text box that was invisible, because any of the numbers you typed
could satisfy any of the entries.

Marking is per box and stays forgiving inside it: every number you type in a
box is considered, so "3072 = 32*32*3" counts, and the tolerance is half a
percent. Order is no longer free, because the label says which box is which.

Labels may contain $...$ -- they go through KaTeX like everything else. Keep
them short: they sit to the left of a narrow input.
"""

EXPECTED = {
    # ------------------------------------------------------------- exam 01
    "e01q42": [("receptive field of L3", 19)],
    "e01q43": [("$d_k$", 64), ("parameters in $W^{O}$", 262144)],
    "e01q44": [("height", 128), ("width", 128), ("channels", 192)],
    "e01q45": [("learnable parameters", 64480)],
    "e01q46": [("batch-all triplets", 3000), ("batch-hard triplets", 30),
               ("ratio", 100)],
    # ------------------------------------------------------------- exam 02
    "e02q40": [("encoder tokens", 49), ("decoder tokens", 196),
               ("attention term smaller by", 16)],
    "e02q41": [("adapter parameters", 65536), ("full matrix ÷ adapter", 256)],
    "e02q42": [("weights alone, GB", 14),
               ("weights + gradients + Adam, GB", 56), ("ratio", 4)],
    "e02q43": [("guided evaluations", 100), ("unguided evaluations", 50)],
    "e02q44": [("evaluations per frame", 30720000)],
    # ------------------------------------------------------------- exam 03
    "e03q43": [("output height", 112), ("output width", 112),
               ("output channels", 64), ("parameters", 9472)],
    "e03q44": [("learnable parameters", 79510)],
    "e03q45": [("$d_k$", 64), ("the four attention projections", 262144),
               ("the feed-forward network", 524288)],
    "e03q46": [("global query–key pairs", 65536), ("windowed query–key pairs", 4096),
               ("ratio", 16)],
    "e03q47": [("$256^3$, MiB", 64), ("factor at $512^3$", 8), ("$512^3$, MiB", 512)],
    "e03q48": [("batch-all triplets", 2688), ("batch-hard triplets", 32),
               ("ratio", 84)],
    # ------------------------------------------------------------- exam 04
    "e04q43": [("jump $J$", 2), ("receptive field $R$", 16)],
    "e04q44": [("windows", 64), ("windowed query–key pairs", 16384),
               ("global query–key pairs", 1048576), ("ratio", 64)],
    "e04q45": [("connected components", 3), ("$\\operatorname{rank}(L)$", 5),
               ("$\\operatorname{trace}(L)$", 12),
               ("multiplicity of the eigenvalue $0$", 3)],
    "e04q46": [("ceiling, bits", 10), ("ceiling, nats", 6.93),
               ("$N$ needed for 15 bits", 32768)],
    "e04q47": [("full fine-tuning parameters", 1048576), ("LoRA parameters", 32768),
               ("compression ratio", 32)],
    "e04q48": [("$\\alpha$", 0.8), ("$\\bar\\alpha_2$", 0.64),
               ("coefficient of $\\mathbf{x}_0$", 0.8),
               ("coefficient of $\\varepsilon$", 0.6)],
    # ------------------------------------------------------------- exam 05
    "e05q43": [("$d_k$", 100), ("$4nd^2$", 400000000), ("$2n^2d$", 20000000),
               ("total", 420000000)],
    "e05q44": [("layers $L$", 11), ("side length", 23),
               ("active voxels", 12167)],
    "e05q45": [("batch size $B$", 128), ("batch-all triplets", 107520),
               ("batch-hard triplets", 128), ("ratio", 840)],
    "e05q46": [("weights, two modalities", 20000), ("weights, three modalities", 200000),
               ("factor", 10)],
    "e05q47": [("$\\Omega_i$ at $\\Delta\\theta = 0.1$", 500),
               ("$\\Omega_i$ at $\\Delta\\theta = 0.2$", 2000)],
    "e05q48": [("evaluations per frame", 200000000), ("seconds per frame", 20)],
    # ------------------------------------------------------------- exam 06
    "e06q43": [("standard convolution", 41472), ("depthwise separable", 5184),
               ("ratio", 8)],
    "e06q44": [("tokens in the batch", 10000), ("masked positions", 1500),
               ("logits from the MLM head", 45000000)],
    "e06q45": [("octree, bytes", 184), ("dense $4^3$ grid, bytes", 256)],
    "e06q46": [("$c_{ij}$", 0.125), ("$c_{ii}$", 0.25), ("unnormalised, both", 1)],
    "e06q47": [("$K = 4096$, nats", 8.316), ("$K = 4096$, bits", 12),
               ("$K = 65{,}536$, nats", 11.09), ("$K = 65{,}536$, bits", 16)],
    "e06q48": [("$\\gamma = 0.5$, first component", 0.5),
               ("$\\gamma = 0.5$, second", 1),
               ("$\\gamma = 1$, first", -1), ("$\\gamma = 1$, second", 3),
               ("$\\gamma = 4$, first", -10), ("$\\gamma = 4$, second", 15)],
    # ------------------------------------------------------------- exam 07
    "e07q43": [("$K^{\\text{eff}}$, layer 1", 3), ("layer 2", 5),
               ("layer 3", 9), ("layer 4", 17), ("layer 5", 33),
               ("receptive field $R$", 63)],
    "e07q44": [("global term $2(hw)^2C$", 32000000), ("window term $2M^2hwC$", 2000000),
               ("ratio", 16)],
    "e07q45": [("$p$ at $s = 1$", 0.731), ("loss at $s = 1$", 0.313),
               ("$p$ at $s = 30$, to 3 dp", 1), ("loss at $s = 30$, to 3 dp", 0)],
    "e07q46": [("$\\tau\\ln(N-1)$", 0.693)],
    "e07q47": [("weights, GB", 14), ("gradients, GB", 14),
               ("Adam's two states, GB", 28), ("total, GB", 56),
               ("removed by LoRA, GB", 42)],
    "e07q48": [("$\\bar\\alpha_3$", 0.729), ("first $k$ with $\\bar\\alpha_k$ below $0.5$", 7)],
    # ------------------------------------------------------------- exam 08
    "e08q43": [("input dimension", 3072), ("weights", 36864)],
    "e08q44": [("$d_k$", 64), ("parameters in $W^{O}$", 262144),
               ("all four projections", 1048576)],
    "e08q45": [("stage 1 resolution", 512), ("stage 1 channels", 96),
               ("stage 2 resolution", 256), ("stage 2 channels", 192),
               ("stage 3 resolution", 128), ("stage 3 channels", 384)],
    "e08q46": [("nodes after 3 layers", 53)],
    "e08q47": [("batch size $B$", 128), ("positives per anchor", 3),
               ("negatives per anchor", 124), ("batch-all triplets", 47616)],
    "e08q48": [("$T$ at $t = 1$", 0.5), ("$T$ at $t = 2$", 0.25),
               ("$T$ at $t = 3$", 0.125), ("$T$ at $t = 4$", 0.0625),
               ("absorbed in the first unit", 0.5)],
    # ------------------------------------------------------------- exam 09
    "e09q43": [("dense layer parameters", 100100), ("convolution parameters", 9100),
               ("ratio", 11)],
    "e09q44": [("tokens", 512), ("query–key pairs", 262144)],
    "e09q45": [("occupied at $32^3$", 3277), ("occupied at $128^3$", 52429),
               ("the grid grew by", 64)],
    "e09q46": [("cosine similarity", 0.5), ("Euclidean distance", 1),
               ("largest distance on the sphere", 2)],
    "e09q47": [("ceiling, bits", 8), ("ceiling, nats", 5.544),
               ("$N$ to double the bits", 65536)],
    "e09q48": [("DDPM, seconds", 12), ("ODE solver, seconds", 0.36)],
    # ------------------------------------------------------------- exam 10
    "e10q43": [("output height", 50), ("output width", 50), ("output channels", 200),
               ("parameters", 180200), ("multiply–accumulates", 450000000)],
    "e10q44": [("sequence length at $224$", 197), ("sequence length at $448$", 785),
               ("the attention matrix grows by", 16)],
    "e10q45": [("after 1 layer", 4), ("after 2 layers", 10),
               ("after 3 layers", 22)],
    "e10q46": [("batch size $B$", 128), ("positives per anchor", 7),
               ("negatives per anchor", 120),
               ("batch-all triplets", 107520), ("batch-hard triplets", 128)],
    "e10q47": [("loss when guessing, nats", 6.93), ("ceiling, bits", 10),
               ("$N$ to double the ceiling", 1048576)],
    "e10q48": [("evaluations per frame", 50000000), ("seconds per frame", 5),
               ("minutes for the video", 25)],
}
