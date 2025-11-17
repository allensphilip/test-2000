package analyzer

import (
	"math"
	"strings"
	"unicode/utf8"
)

// ComputeWER calculates Word Error Rate between reference and hypothesis
// WER = (S + D + I) / N
// where S = substitutions, D = deletions, I = insertions, N = total words in reference
func ComputeWER(reference, hypothesis string) float64 {
	refWords := strings.Fields(reference)
	hypWords := strings.Fields(hypothesis)

	// Compute Levenshtein distance at word level
	distance := levenshteinDistance(refWords, hypWords)

	if len(refWords) == 0 {
		if len(hypWords) == 0 {
			return 0.0
		}
		return 1.0
	}

	return float64(distance) / float64(len(refWords))
}

// ComputeCER calculates Character Error Rate between reference and hypothesis
// CER = (S + D + I) / N
// where S = substitutions, D = deletions, I = insertions, N = total characters in reference
func ComputeCER(reference, hypothesis string) float64 {
	refChars := []rune(reference)
	hypChars := []rune(hypothesis)

	// Compute Levenshtein distance at character level
	refStrings := make([]string, len(refChars))
	hypStrings := make([]string, len(hypChars))
	for i, r := range refChars {
		refStrings[i] = string(r)
	}
	for i, r := range hypChars {
		hypStrings[i] = string(r)
	}

	distance := levenshteinDistance(refStrings, hypStrings)

	if utf8.RuneCountInString(reference) == 0 {
		if utf8.RuneCountInString(hypothesis) == 0 {
			return 0.0
		}
		return 1.0
	}

	return float64(distance) / float64(utf8.RuneCountInString(reference))
}

// ComputeBLEU calculates BLEU score (simplified sentence-level BLEU)
// BLEU measures the precision of n-gram matches between reference and hypothesis
func ComputeBLEU(reference, hypothesis string) float64 {
	refWords := strings.Fields(reference)
	hypWords := strings.Fields(hypothesis)

	if len(hypWords) == 0 {
		return 0.0
	}

	// Compute precision for n-grams (1 to 4)
	maxN := 4
	precisions := make([]float64, maxN)

	for n := 1; n <= maxN; n++ {
		refNgrams := getNgrams(refWords, n)
		hypNgrams := getNgrams(hypWords, n)

		if len(hypNgrams) == 0 {
			precisions[n-1] = 0.0
			continue
		}

		matches := 0
		for ngram := range hypNgrams {
			if refNgrams[ngram] > 0 {
				matches += min(hypNgrams[ngram], refNgrams[ngram])
			}
		}

		precisions[n-1] = float64(matches) / float64(len(hypNgrams))
	}

	// Geometric mean of precisions
	logSum := 0.0
	for _, p := range precisions {
		if p == 0 {
			return 0.0
		}
		logSum += math.Log(p)
	}
	geometricMean := math.Exp(logSum / float64(maxN))

	// Brevity penalty
	refLen := len(refWords)
	hypLen := len(hypWords)
	bp := 1.0
	if hypLen < refLen {
		bp = math.Exp(1.0 - float64(refLen)/float64(hypLen))
	}

	return bp * geometricMean
}

// Helper functions

// levenshteinDistance computes the edit distance between two slices of strings
// Used by both WER and CER calculations
func levenshteinDistance(s1, s2 []string) int {
	len1 := len(s1)
	len2 := len(s2)

	matrix := make([][]int, len1+1)
	for i := range matrix {
		matrix[i] = make([]int, len2+1)
	}

	for i := 0; i <= len1; i++ {
		matrix[i][0] = i
	}
	for j := 0; j <= len2; j++ {
		matrix[0][j] = j
	}

	for i := 1; i <= len1; i++ {
		for j := 1; j <= len2; j++ {
			cost := 0
			if s1[i-1] != s2[j-1] {
				cost = 1
			}

			matrix[i][j] = min(
				matrix[i-1][j]+1,      // deletion
				matrix[i][j-1]+1,      // insertion
				matrix[i-1][j-1]+cost, // substitution
			)
		}
	}

	return matrix[len1][len2]
}

// getNgrams returns a map of n-grams with their counts
// Used by BLEU score calculation
func getNgrams(words []string, n int) map[string]int {
	ngrams := make(map[string]int)

	if n > len(words) {
		return ngrams
	}

	for i := 0; i <= len(words)-n; i++ {
		ngram := strings.Join(words[i:i+n], " ")
		ngrams[ngram]++
	}

	return ngrams
}

// min returns the minimum value among the provided integers
func min(a, b int, rest ...int) int {
	result := a
	if b < result {
		result = b
	}
	for _, v := range rest {
		if v < result {
			result = v
		}
	}
	return result
}
