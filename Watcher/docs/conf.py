# Configuration file for the Sphinx documentation builder.
#
# This file only contains a selection of the most common options. For a full
# list see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Path setup --------------------------------------------------------------

# If extensions (or modules to document with autodoc) are in another directory,
# add these directories to sys.path here. If the directory is relative to the
# documentation root, use os.path.abspath to make it absolute, like shown here.
#
import django
import os
import sys

from django.conf import settings

sys.path.insert(0, os.path.abspath('../'))
settings.configure()
django.setup()

# -- Project information -----------------------------------------------------

project = 'Watcher'
author = 'Ygal Nezri & Félix Herrenschmidt'

# The full version, including alpha/beta/rc tags
release = '2.4'

copyright = '2025 - Thales CERT'

# -- General configuration ---------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    'sphinx.ext.autodoc',
    'myst_parser',
]

# Add any paths that contain templates here, relative to this directory.
templates_path = ['_templates']

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
html_theme = 'sphinx_rtd_theme'

html_logo = '../static/Watcher-logo-documentation.png'
html_favicon = '../static/Watcher-favicon.ico'


html_theme_options = {
    'logo_only': True,
}

myst_heading_anchors = 3
