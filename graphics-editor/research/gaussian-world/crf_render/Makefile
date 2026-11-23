CXX ?= g++
CXXFLAGS ?= -O3 -march=native -std=c++17 -fopenmp -DNDEBUG
all: crf_render
crf_render: src/renderer.cpp
	$(CXX) $(CXXFLAGS) $< -o $@
clean:
	rm -f crf_render
.PHONY: all clean
