# -*- coding: utf-8 -*-
r"""Dropdown choices for every fill-in-the-blank blank.

Viktor: "fill in the blanks should have a dropdown at each location with lets
say 5-10 different choices, some of the choices should be not so obvious near
miss."

So the distractors here are not filler. Each one is a thing a person could
plausibly write: the two terms that are always confused (equivariant /
invariant, drift / diffusion, linear / quadratic), the formula with one index
off (J_l instead of J_{l-1}), the operation that is also symmetric but is not
the one PointNet uses (sum pooling for max pooling), the family that sounds
like it belongs but does not (distillation-based among the continual-learning
four).

DISTRACTORS[question id] is a list, one entry per blank, of wrong answers.
The correct answer is added by the build and the list is then shuffled with a
seed derived from the blank, so the right one is not always in the same place.
"""

DISTRACTORS = {
    # ---------------------------------------------------------------- exam 01
    "e01q31": [
        ["$K(D-1)+1$", "$D(K+1)-1$", "$DK$", "$K + D - 1$", "$(K-1)/D + 1$"],
        [r"$R_{l-1} + (K_{\text{eff},l}-1)\,J_{l}$",
         r"$R_{l-1} + K_{\text{eff},l}\,J_{l-1}$",
         r"$R_{l-1} + (K_{\text{eff},l}-1)\,S_{l}$",
         r"$R_{l-1}\,J_{l-1} + K_{\text{eff},l}$",
         r"$R_{l-1} + (K_{\text{eff},l}+1)\,J_{l-1}$"],
        [r"$J_{l-1} + S_l$", r"$J_{l}\,S_{l-1}$", r"$J_{l-1}/S_l$",
         r"$J_{l-1}\,K_l$", r"$S_l$"],
    ],
    "e01q32": [["$O(n d^2)$", "$O(n)$", "$O(1)$", "$O(n^2)$", "$O(\\log n)$", "$O(nd)$"]] * 6,
    "e01q33": [
        ["$M/2 \\times M/2$", "$2M \\times 2M$", "$7 \\times 7$", "$M \\times 1$"],
        ["$M$", "$\\lceil M/2 \\rceil$", "$M/4$", "$2M$", "$1$"],
        ["within-window", "cross-channel", "global", "hierarchical", "shifted"],
    ],
    "e01q34": [
        ["$2L$", "$1 + L$", "$3L$", "$2L - 1$", "$L^3$"],
        ["$(1+2L)^2$", "$1 + 2L^3$", "$3(1+2L)$", "$(2L)^3$", "$8L^3$"],
        ["a cube of side $1+L$", "$(1+2L)^3$ voxels", "a cube of side $3$",
         "nothing at all"],
    ],
    "e01q35": [
        ["$A - D$", "$D + A$", "$A$", "$D^{-1}A$", "$I - A$"],
        ["$D^{-1/2} A D^{-1/2}$", "$I + D^{-1/2} A D^{-1/2}$", "$D^{-1} L$",
         "$L D^{-1}$", "$I - D^{-1} A$"],
        [r"$\sigma(D^{-1/2} A D^{-1/2} H^{(l)} W^{(l)})$",
         r"$\sigma(\tilde A H^{(l)} W^{(l)})$",
         r"$\sigma(\tilde D^{-1}\tilde A H^{(l)} W^{(l)})$",
         r"$\tilde D^{-1/2}\tilde A \tilde D^{-1/2} H^{(l)} W^{(l)}$"],
    ],
    "e01q36": [
        ["quasi-metric", "semi-metric", "ultrametric", "premetric", "a norm"],
        ["over-smoothing", "mode collapse", "overfitting", "vanishing gradients",
         "dead units"],
        ["$0$", "$2m$", "$m^2$", "$1$"],
    ],
    # ---------------------------------------------------------------- exam 02
    "e02q27": [
        ["keys", "values", "keys and values", "queries and keys"],
        ["queries", "values only", "queries and values", "keys only"],
        ["one per modality", "two joint", "a scalar score", "no"],
        ["one joint", "a single fused vector", "one per layer",
         "a similarity matrix"],
    ],
    "e02q28": [
        ["a simple average", "an exact copy", "a gradient update",
         "a momentum of the gradients", "a running variance"],
        ["weight decay", "gradient reversal", "batch normalisation",
         "gradient clipping", "dropout"],
        ["uniform", "sharpened", "zero-mean", "bimodal"],
        ["fixed, non-uniform", "one-hot", "Gaussian", "sharpened"],
    ],
    "e02q29": [
        ["$\\log(N-1)$", "$N$", "$\\log_2 N$", "$-\\log N$", "$\\log N / N$"],
        ["floor", "lower bound", "asymptote", "threshold"],
    ],
    "e02q30": [
        ["$AB$", "$A + B$", "$B^{\\top}A$", "$AB^{\\top}$"],
        ["$dr$", "$d^2 r$", "$2d + r$", "$r^2$"],
        ["zero map", "scaling by $\\lambda$", "transpose", "projection"],
        ["$+\\lambda$", "$-1$", "$\\lambda^{-1}$", "$0$"],
    ],
    "e02q31": [
        ["bias–variance", "exploration–exploitation",
         "precision–recall", "plasticity–elasticity"],
    ] + [["regularisation-based", "replay-based", "optimisation-based",
          "architecture-based", "distillation-based", "ensemble-based",
          "curriculum-based"]] * 4,
    "e02q32": [
        ["diffusion term", "score function", "noise schedule", "Wiener process"],
        ["drift", "score function", "noise level", "step size"],
        ["Poisson process", "Markov chain", "Gaussian mixture",
         "Ornstein–Uhlenbeck process"],
        ["variance-exploding", "variance-reducing", "mean-preserving",
         "signal-preserving", "norm-preserving"],
        ["variance-preserving", "variance-reducing", "mean-exploding",
         "signal-exploding", "norm-exploding"],
    ],
    "e02q33": [
        ["position $(x,y,z)$ alone", "view direction $(\\theta,\\phi)$ alone",
         "a ray and a depth", "pixel coordinates"],
        ["colour $\\mathbf{c}$ alone", "density $\\sigma$ alone",
         "transmittance $T$ and colour $\\mathbf{c}$", "an RGBA value"],
        ["the position", "the transmittance", "the number of samples",
         "the camera intrinsics"],
        ["colour is the same from every direction",
         "the network would otherwise be too large",
         "density is easier to learn than colour",
         "the renderer requires it"],
    ],
    # ---------------------------------------------------------------- exam 03
    "e03q31": [
        ["$(H + 2P - K)/S$", "$\\lfloor (H - K + 2P)/S \\rfloor$",
         "$\\lceil (H + 2P - K)/S \\rceil + 1$",
         "$\\lfloor (H + P - K)/S \\rfloor + 1$", "$H/S$"],
        ["$K\\,C_{\\text{in}} C_{\\text{out}}$", "$K^2 C_{\\text{in}}$",
         "$K^2 (C_{\\text{in}} + C_{\\text{out}})$", "$K^2 C_{\\text{out}}$",
         "$2K C_{\\text{in}} C_{\\text{out}}$"],
        ["$C_{\\text{in}}$", "$K^2$", "$C_{\\text{in}} C_{\\text{out}}$", "$1$"],
    ],
    "e03q32": [
        ["invariant", "covariant", "permutation-free", "order-sensitive"],
        ["layer normalisation", "a causal mask", "a residual connection",
         "token embeddings"],
        ["before", "instead of", "in place of",
         "twice, before and after", "only in the decoder"],
    ],
    "e03q33": [
        ["linear", "logarithmic", "constant", "cubic"],
        ["quadratic", "logarithmic", "constant", "cubic"],
        ["the windows stay the same size", "the cost stays linear",
         "the model has fewer parameters",
         "attention becomes global in a single layer"],
    ],
    "e03q34": [
        ["colour channel order", "the number of points", "feature scaling",
         "spatial (rigid) transformation"],
        ["point permutation", "the number of points", "feature scaling",
         "sampling density"],
        ["point permutation", "colour channel order", "feature scaling",
         "spatial (rigid) transformation"],
        ["asymmetric", "monotone", "linear", "injective"],
        ["sum pooling", "average pooling", "the T-Net",
         "a fully connected layer"],
    ],
    "e03q35": [
        ["sigmoid", "layer normalisation", "$L_2$ normalisation", "a hard max"],
        ["all nodes", "the whole graph", "the node's own features",
         "the edges of the graph"],
        ["skip connections", "dropout", "batch normalisation",
         "gradient clipping", "attention heads"],
        ["self-loops", "dropout", "batch normalisation", "gradient clipping",
         "attention heads"],
    ],
    "e03q36": [
        [r"$\max(0,\ \mathcal{D}(a,n) - \mathcal{D}(a,p) + m)$",
         r"$\max(0,\ \mathcal{D}(a,p) - \mathcal{D}(a,n) - m)$",
         r"$\mathcal{D}(a,p) - \mathcal{D}(a,n) + m$",
         r"$\max(0,\ \mathcal{D}(a,p) + \mathcal{D}(a,n) - m)$"],
        ["easy", "semi-hard", "anchor", "marginal", "trivial"],
        ["hard", "easy", "marginal", "trivial", "anchor"],
    ],
}
